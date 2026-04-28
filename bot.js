const { Bot, InlineKeyboard } = require("grammy");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");

// --- CONFIGURATION ---
const BOT_TOKEN = "8704490710:AAFaWVhJE9Re13AzVvritpKKTwTGB2BAmB0";
const API_ID = 28798037;
const API_HASH = "30c7aebbfe286c08acbb8be832c8d3c6";

const bot = new Bot(BOT_TOKEN);
const client = new TelegramClient(new StringSession(""), API_ID, API_HASH, { connectionRetries: 5 });

// Cache with TTL to prevent memory leaks
const taskCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
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
    try {
        const res = await fetch("https://api.v02.savethevideo.com/tasks", {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });

        if (res.status === 429 && retryCount < 5) {
            await new Promise(r => setTimeout(r, 5000 * (retryCount + 1)));
            return callAPI(payload, retryCount + 1);
        }

        const data = await res.json();
        if (data.code === 429 && retryCount < 5) {
             await new Promise(r => setTimeout(r, 5000 * (retryCount + 1)));
             return callAPI(payload, retryCount + 1);
        }
        return data;
    } catch (e) {
        if (retryCount < 3) return callAPI(payload, retryCount + 1);
        throw e;
    }
}

async function pollTask(id, maxAttempts = 60) {
    let attempts = 0;
    while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 3000));
        try {
            const res = await fetch("https://api.v02.savethevideo.com/tasks/" + id, { headers: getHeaders() });

            if (res.status === 429) {
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }

            const data = await res.json();
            if (data.code === 429) { await new Promise(r => setTimeout(r, 5000)); continue; }
            if (data.state === "completed") return Array.isArray(data.result) ? data.result[0] : data.result;
            if (data.state === "failed") throw new Error(data.error ? data.error.message : "API processing failed.");
        } catch (e) { console.error("[POLL ERROR]", e.message); }
        attempts++;
    }
    throw new Error("Task polling timed out.");
}

// --- BOT HANDLERS ---
bot.command("start", (ctx) => ctx.reply("Welcome! Send me a Dailymotion or Animecube URL."));

bot.on("message:text", async (ctx) => {
    const url = ctx.message.text.trim();
    if (!url.startsWith("http")) return;

    let statusMsg = await ctx.reply("🔍 Extracting info...");

    try {
        const infoData = await callAPI({ type: "info", url: url });
        if (infoData.code) throw new Error(infoData.message);

        const result = await pollTask(infoData.id);
        if (!result || !result.formats) throw new Error("No formats found.");

        const formats = result.formats.filter(f => f.width && f.height);
        formats.sort((a, b) => (a.width * a.height) - (b.width * b.height));

        const keyboard = new InlineKeyboard();
        taskCache.set(infoData.id, { url, formats, timestamp: Date.now() });

        formats.slice(0, 10).forEach((f, index) => {
            keyboard.text(`${f.width}x${f.height} (${f.ext || 'mp4'})`, `dl:${infoData.id}:${index}`).row();
        });

        await bot.api.editMessageText(ctx.chat.id, statusMsg.message_id, "✅ Select resolution:", { reply_markup: keyboard });

    } catch (err) {
        await bot.api.editMessageText(ctx.chat.id, statusMsg.message_id, "❌ Error: " + err.message);
    }
});

bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!data.startsWith("dl:")) return;

    const [_, taskId, formatIndex] = data.split(":");
    const cached = taskCache.get(taskId);

    if (!cached) return ctx.answerCallbackQuery("Session expired. Please send the link again.");
    await ctx.answerCallbackQuery().catch(() => {});

    let statusMsg = await ctx.reply("⏳ Initializing server download...");
    let tempPath = null;

    try {
        const formatId = cached.formats[parseInt(formatIndex)].format_id;
        const dlTask = await callAPI({ type: "download", url: cached.url, format: formatId });
        if (dlTask.code) throw new Error(dlTask.message);

        let finalResult;
        let lastStatus = "";
        let attempts = 0;

        // Progress Polling Loop (5s)
        while (attempts < 100) {
            await new Promise(r => setTimeout(r, 5000));
            const pollRes = await fetch("https://api.v02.savethevideo.com/tasks/" + dlTask.id, { headers: getHeaders() });
            const pollData = await pollRes.json();

            if (pollData.state === "completed") { finalResult = pollData.result; break; }
            if (pollData.state === "failed") throw new Error(pollData.error ? pollData.error.message : "Conversion failed.");

            let currentStatus = `⏳ Status: ${pollData.state.toUpperCase()}\n📊 Progress: ${pollData.progress || 'Processing...'}`;
            if (currentStatus !== lastStatus) {
                await bot.api.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
                statusMsg = await ctx.reply(currentStatus);
                lastStatus = currentStatus;
            }
            attempts++;
        }

        if (!finalResult) throw new Error("Conversion timed out.");

        await bot.api.editMessageText(ctx.chat.id, statusMsg.message_id, "🚀 Conversion complete! Uploading to Telegram...");

        tempPath = path.join(__dirname, `video_${Date.now()}_${Math.floor(Math.random()*1000)}.mp4`);
        const response = await fetch(finalResult.download_url);
        if (!response.ok) throw new Error("Failed to fetch file from server.");

        await pipeline(response.body, fs.createWriteStream(tempPath));

        await client.sendFile(ctx.chat.id, {
            file: tempPath,
            caption: `Source: ${cached.url}`,
            fileName: "video.mp4"
        });

        await bot.api.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
        taskCache.delete(taskId);

    } catch (err) {
        await ctx.reply("❌ Error: " + err.message);
    } finally {
        if (tempPath && fs.existsSync(tempPath)) {
            try { fs.unlinkSync(tempPath); } catch (e) {}
        }
    }
});

// Cache Cleanup
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of taskCache.entries()) if (now - v.timestamp > CACHE_TTL) taskCache.delete(k);
}, 60000);

(async () => {
    try {
        await client.start({ botAuthToken: BOT_TOKEN });
        bot.start();
        console.log("Bot Online.");
    } catch (e) { console.error("Startup failed:", e); }
})();
