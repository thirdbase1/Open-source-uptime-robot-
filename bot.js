const { Bot, InlineKeyboard, GrammyError, HttpError } = require("grammy");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");

// Hardcoded Credentials
const BOT_TOKEN = "8704490710:AAFaWVhJE9Re13AzVvritpKKTwTGB2BAmB0";
const API_ID = 28798037;
const API_HASH = "30c7aebbfe286c08acbb8be832c8d3c6";

const bot = new Bot(BOT_TOKEN);
const client = new TelegramClient(new StringSession(""), API_ID, API_HASH, {
    connectionRetries: 10,
});

// Cache management
const taskCache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 mins

const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
];

function getHeaders() {
    return {
        "Content-Type": "application/json",
        "Referer": "https://www.savethevideo.com/",
        "Origin": "https://www.savethevideo.com",
        "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
    };
}

async function callAPI(payload, retryCount = 0) {
    try {
        const res = await fetch("https://api.v02.savethevideo.com/tasks", {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if ((res.status === 429 || data.code === 429) && retryCount < 5) {
            await new Promise(r => setTimeout(r, 5000 * (retryCount + 1)));
            return callAPI(payload, retryCount + 1);
        }
        return data;
    } catch (e) {
        if (retryCount < 3) return callAPI(payload, retryCount + 1);
        throw e;
    }
}

async function pollTask(id) {
    let attempts = 0;
    while (attempts < 60) {
        await new Promise(r => setTimeout(r, 3000));
        try {
            const res = await fetch("https://api.v02.savethevideo.com/tasks/" + id, { headers: getHeaders() });
            const data = await res.json();
            if ((res.status === 429 || data.code === 429)) {
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }
            if (data.state === "completed") return Array.isArray(data.result) ? data.result[0] : data.result;
            if (data.state === "failed") throw new Error(data.error ? data.error.message : "API processing failed.");
        } catch (e) { console.error("Poll error:", e.message); }
        attempts++;
    }
    throw new Error("Timeout waiting for processing.");
}

async function getResult(data) {
    if (data.state === "completed") return Array.isArray(data.result) ? data.result[0] : data.result;
    return pollTask(data.id);
}

bot.command("start", (ctx) => ctx.reply("Send a Dailymotion or Animecube link to get download options."));

bot.on("message:text", async (ctx) => {
    const url = ctx.message.text.trim();
    if (!url.startsWith("http")) return;

    const statusMsg = await ctx.reply("🔍 Analyzing video...");

    try {
        const infoData = await callAPI({ type: "info", url: url });
        if (infoData.code) throw new Error(infoData.message);

        const result = await getResult(infoData);
        if (!result || !result.formats) throw new Error("No formats found.");

        const formats = result.formats.filter(f => f.width && f.height);
        formats.sort((a, b) => (a.width * a.height) - (b.width * b.height));

        const keyboard = new InlineKeyboard();
        const taskId = infoData.id;

        taskCache.set(taskId, { url, formats, timestamp: Date.now() });

        formats.slice(0, 8).forEach((f, index) => {
            keyboard.text(`${f.width}x${f.height}`, `dl:${taskId}:${index}`).row();
        });

        await bot.api.editMessageText(ctx.chat.id, statusMsg.message_id, "✅ Select resolution:", { reply_markup: keyboard });

    } catch (err) {
        console.error("Analysis Error:", err.message);
        await bot.api.editMessageText(ctx.chat.id, statusMsg.message_id, "❌ Error: " + err.message);
    }
});

bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!data.startsWith("dl:")) return;

    const [_, taskId, formatIndex] = data.split(":");
    const cached = taskCache.get(taskId);

    try {
        await ctx.answerCallbackQuery().catch(() => {});
        if (!cached) return ctx.reply("Session expired. Please send the link again.");

        const statusMsg = await ctx.reply("⏳ Converting video...");
        const formatId = cached.formats[parseInt(formatIndex)].format_id;

        const dlTask = await callAPI({ type: "download", url: cached.url, format: formatId });
        if (dlTask.code) throw new Error(dlTask.message);

        const dlResult = await getResult(dlTask);

        await bot.api.editMessageText(ctx.chat.id, statusMsg.message_id, "🚀 Uploading...");

        const tempPath = path.join(__dirname, `video_${Date.now()}.mp4`);
        const response = await fetch(dlResult.download_url);
        if (!response.ok) throw new Error("Conversion server error.");

        await pipeline(response.body, fs.createWriteStream(tempPath));

        await client.sendFile(ctx.chat.id, {
            file: tempPath,
            caption: `Source: ${cached.url}`,
            fileName: "video.mp4"
        });

        await bot.api.deleteMessage(ctx.chat.id, statusMsg.message_id);
    } catch (err) {
        console.error("Callback Error:", err.message);
        await ctx.reply("❌ Error: " + err.message);
    }
});

// Robust Error Handling
bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id}:`);
    const e = err.error;
    if (e instanceof GrammyError) {
        console.error("Error in helper:", e.description);
    } else if (e instanceof HttpError) {
        console.error("Could not contact Telegram:", e);
    } else {
        console.error("Unknown error:", e);
    }
});

(async () => {
    console.log("Starting...");
    await client.start({ botAuthToken: BOT_TOKEN });
    bot.start();
    console.log("Bot Online.");

    // Interval for cache cleanup
    setInterval(() => {
        const now = Date.now();
        for (const [k, v] of taskCache.entries()) if (now - v.timestamp > CACHE_TTL) taskCache.delete(k);
    }, 60000);
})();
