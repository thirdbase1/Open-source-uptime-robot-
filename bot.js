const { Bot, InlineKeyboard, GrammyError, HttpError } = require("grammy");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");

// --- CREDENTIALS ---
const BOT_TOKEN = "8704490710:AAFaWVhJE9Re13AzVvritpKKTwTGB2BAmB0";
const API_ID = 28798037;
const API_HASH = "30c7aebbfe286c08acbb8be832c8d3c6";

const bot = new Bot(BOT_TOKEN);
const client = new TelegramClient(new StringSession(""), API_ID, API_HASH, {
    connectionRetries: 15,
    autoReconnect: true
});

const taskCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0"
];

function getHeaders() {
    return {
        "Content-Type": "application/json",
        "Referer": "https://www.savethevideo.com/",
        "Origin": "https://www.savethevideo.com",
        "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
    };
}

// --- API HELPERS ---
async function callAPI(payload, retryCount = 0) {
    console.log(`[API LOG] type=${payload.type} count=${retryCount}`);
    try {
        const res = await fetch("https://api.v02.savethevideo.com/tasks", {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if ((res.status === 429 || data.code === 429) && retryCount < 6) {
            const delay = 10000 * (retryCount + 1);
            console.warn(`[API LOG] 429 Rate Limit. Retrying in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            return callAPI(payload, retryCount + 1);
        }
        return data;
    } catch (e) {
        console.error(`[API LOG] Error: ${e.message}`);
        if (retryCount < 3) return callAPI(payload, retryCount + 1);
        throw e;
    }
}

async function pollTask(id, maxAttempts = 300) {
    let attempts = 0;
    while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 4000));
        try {
            const res = await fetch("https://api.v02.savethevideo.com/tasks/" + id, { headers: getHeaders() });
            const data = await res.json();

            if (res.status === 429 || data.code === 429) {
                await new Promise(r => setTimeout(r, 10000));
                continue;
            }
            if (data.state === "completed") return data;
            if (data.state === "failed") {
                console.error(`[API LOG] Task ${id} failed:`, JSON.stringify(data.error || data));
                if (data.error && data.error.retry && attempts < 20) continue;
                throw new Error(data.error ? data.error.message : "API processing failed.");
            }
        } catch (e) {
            console.error(`[POLL ERROR] ${id}:`, e.message);
        }
        attempts++;
    }
    throw new Error("Polling timeout.");
}

// --- BOT HANDLERS ---
bot.command("start", (ctx) => ctx.reply("Bot is online! Send a video link to download it in your preferred resolution."));

bot.on("message:text", async (ctx) => {
    const url = ctx.message.text.trim();
    if (!url.startsWith("http")) return;

    console.log(`[BOT LOG] URL from ${ctx.from.id}: ${url}`);
    let statusMsg = await ctx.reply("🔍 Extracting video info... please wait.");

    try {
        const infoData = await callAPI({ type: "info", url: url });
        if (infoData.code) throw new Error(infoData.message);

        const pollResult = await pollTask(infoData.id);
        const result = Array.isArray(pollResult.result) ? pollResult.result[0] : pollResult.result;

        if (!result || !result.formats) throw new Error("No formats found for this link.");

        const formats = result.formats.filter(f => f.width && f.height);
        formats.sort((a, b) => (a.width * a.height) - (b.width * b.height));

        const keyboard = new InlineKeyboard();
        taskCache.set(infoData.id, { url, formats, timestamp: Date.now() });

        formats.slice(0, 10).forEach((f, index) => {
            keyboard.text(`${f.width}x${f.height} (${f.ext || 'mp4'})`, `dl:${infoData.id}:${index}`).row();
        });

        await bot.api.editMessageText(ctx.chat.id, statusMsg.message_id, "✅ Info retrieved! Choose a resolution:", { reply_markup: keyboard });

    } catch (err) {
        console.error("[BOT LOG] Info Error:", err.message);
        await bot.api.editMessageText(ctx.chat.id, statusMsg.message_id, "❌ Error: " + err.message + "\n\nServer may be busy, please try again in a minute.");
    }
});

bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!data.startsWith("dl:")) return;

    const [_, taskId, formatIdx] = data.split(":");
    const cached = taskCache.get(taskId);

    try {
        await ctx.answerCallbackQuery().catch(() => {});
        if (!cached) return ctx.reply("Session expired. Please resend the video link.");

        const format = cached.formats[parseInt(formatIdx)];
        console.log(`[BOT LOG] User ${ctx.from.id} chose ${format.width}x${format.height}`);

        let statusMsg = await ctx.reply("⏳ Sending request to conversion server...");
        const dlTask = await callAPI({ type: "download", url: cached.url, format: format.format_id });
        if (dlTask.code) throw new Error(dlTask.message);

        let finalPollData;
        let lastUiText = "";
        let attempts = 0;

        // 5-second Polling with cleanup (Delete/Resend)
        while (attempts < 400) {
            await new Promise(r => setTimeout(r, 5000));
            const pollRes = await fetch("https://api.v02.savethevideo.com/tasks/" + dlTask.id, { headers: getHeaders() });
            const pollData = await pollRes.json();

            if (pollData.state === "completed") { finalPollData = pollData; break; }
            if (pollData.state === "failed") {
                if (pollData.error && pollData.error.retry && attempts < 20) continue;
                throw new Error(pollData.error ? pollData.error.message : "Conversion server error.");
            }

            let uiStatus = `⏳ Downloading to server...\n📊 Status: ${pollData.state.toUpperCase()}\n📉 Progress: ${pollData.progress || 'Processing...'}`;

            if (uiStatus !== lastUiText) {
                await bot.api.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
                statusMsg = await ctx.reply(uiStatus);
                lastUiText = uiStatus;
            }
            attempts++;
        }

        if (!finalPollData) throw new Error("Timed out waiting for file.");

        const resObj = Array.isArray(finalPollData.result) ? finalPollData.result[0] : finalPollData.result;
        const downloadUrl = resObj ? resObj.download_url : null;
        if (!downloadUrl) throw new Error("Download URL missing from response.");

        await bot.api.editMessageText(ctx.chat.id, statusMsg.message_id, "🚀 Conversion complete! Sending file to Telegram...");

        const tempPath = path.join(__dirname, `video_${Date.now()}.mp4`);
        const response = await fetch(downloadUrl);
        if (!response.ok) throw new Error("Failed to fetch MP4 from conversion server.");

        await pipeline(response.body, fs.createWriteStream(tempPath));

        console.log(`[BOT LOG] Uploading via MTProto: ${tempPath}`);
        await client.sendFile(ctx.chat.id, {
            file: tempPath,
            caption: `Source: ${cached.url}`,
            fileName: "video.mp4"
        });

        await bot.api.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
        fs.unlinkSync(tempPath);

    } catch (err) {
        console.error("[BOT LOG] Callback Error:", err.message);
        await ctx.reply("❌ Error: " + err.message);
    }
});

// Cache Cleanup
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of taskCache.entries()) if (now - v.timestamp > CACHE_TTL) taskCache.delete(k);
}, 60000);

bot.catch((err) => console.error("[GLOBAL LOG]", err));

(async () => {
    try {
        console.log("[INIT LOG] Connecting to MTProto...");
        await client.start({ botAuthToken: BOT_TOKEN });
        console.log("[INIT LOG] MTProto Connected.");
        bot.start();
        console.log("[INIT LOG] Bot is Online.");
    } catch (e) { console.error("[FATAL STARTUP]", e); }
})();
