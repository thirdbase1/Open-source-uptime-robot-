const { Bot, InlineKeyboard } = require("grammy");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");

// Hardcoded Credentials as requested
const BOT_TOKEN = "8704490710:AAFaWVhJE9Re13AzVvritpKKTwTGB2BAmB0";
const API_ID = 28798037;
const API_HASH = "30c7aebbfe286c08acbb8be832c8d3c6";

const bot = new Bot(BOT_TOKEN);
const client = new TelegramClient(new StringSession(""), API_ID, API_HASH, {
    connectionRetries: 5,
});

const HEADERS = {
    "Content-Type": "application/json",
    "Referer": "https://www.savethevideo.com/",
    "Origin": "https://www.savethevideo.com",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
};

async function callAPI(payload, retryCount = 0) {
    try {
        const res = await fetch("https://api.v02.savethevideo.com/tasks", {
            method: "POST",
            headers: HEADERS,
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.code === 429 && retryCount < 5) {
            console.log(`Rate limited on callAPI. Retrying...`);
            await new Promise(r => setTimeout(r, 5000 * (retryCount + 1)));
            return callAPI(payload, retryCount + 1);
        }
        return data;
    } catch (e) {
        if (retryCount < 3) return callAPI(payload, retryCount + 1);
        throw e;
    }
}

async function pollTask(id, retryCount = 0) {
    let attempts = 0;
    while (attempts < 60) {
        await new Promise(r => setTimeout(r, 3000));
        try {
            const res = await fetch("https://api.v02.savethevideo.com/tasks/" + id, { headers: HEADERS });
            const data = await res.json();

            if (data.code === 429) {
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }

            if (data.state === "completed") return data.result;
            if (data.state === "failed") {
                console.error("Task failed:", data);
                if (data.error && data.error.retry && attempts < 5) return "RETRY";
                throw new Error(data.error ? data.error.message : "API processing failed.");
            }
        } catch (e) {
            console.error("Poll error:", e);
        }
        attempts++;
    }
    throw new Error("Timeout waiting for video processing.");
}

bot.command("start", (ctx) => ctx.reply("Bot is ready! Send me a Dailymotion or Animecube link."));

bot.on("message:text", async (ctx) => {
    const url = ctx.message.text.trim();
    if (!url.startsWith("http")) return;

    const statusMsg = await ctx.reply("🔍 Extracting video formats...");

    try {
        let infoTask = await callAPI({ type: "info", url: url });
        if (infoTask.code) throw new Error(infoTask.message);

        let infoResult = await pollTask(infoTask.id);
        if (infoResult === "RETRY") {
             infoTask = await callAPI({ type: "info", url: url });
             infoResult = await pollTask(infoTask.id);
        }

        if (!infoResult || !infoResult.formats) throw new Error("Could not find video formats.");

        const formats = infoResult.formats.filter(f => f.width && f.height);
        formats.sort((a, b) => (a.width * a.height) - (b.width * b.height));

        const keyboard = new InlineKeyboard();
        formats.slice(0, 8).forEach(f => {
            keyboard.text(`${f.width}x${f.height} (${f.ext || 'mp4'})`, `dl:${infoTask.id}:${f.format_id}`).row();
        });

        await bot.api.editMessageText(ctx.chat.id, statusMsg.message_id, "✅ Choose a resolution:", { reply_markup: keyboard });

    } catch (err) {
        console.error(err);
        await bot.api.editMessageText(ctx.chat.id, statusMsg.message_id, "❌ Error: " + err.message);
    }
});

bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!data.startsWith("dl:")) return;

    const [_, taskId, formatId] = data.split(":");
    await ctx.answerCallbackQuery("Processing...");
    const statusMsg = await ctx.editMessageText("⏳ Converting video on server...");

    try {
        const taskInfo = await fetch("https://api.v02.savethevideo.com/tasks/" + taskId, { headers: HEADERS });
        const taskData = await taskInfo.json();
        const videoUrl = taskData.result.url;

        let dlTask = await callAPI({ type: "download", url: videoUrl, format: formatId });
        let dlResult = await pollTask(dlTask.id);

        if (dlResult === "RETRY") {
            dlTask = await callAPI({ type: "download", url: videoUrl, format: formatId });
            dlResult = await pollTask(dlTask.id);
        }

        await bot.api.editMessageText(ctx.chat.id, statusMsg.message_id, "🚀 Downloading and Sending...");

        // Save to disk to avoid OOM for large files
        const tempPath = path.join(__dirname, `temp_${Date.now()}.mp4`);
        const response = await fetch(dlResult.download_url);
        if (!response.ok) throw new Error("Failed to download converted video.");

        const fileStream = fs.createWriteStream(tempPath);
        await pipeline(response.body, fileStream);

        // Upload via MTProto
        await client.sendFile(ctx.chat.id, {
            file: tempPath,
            caption: `Source: ${videoUrl}`,
            fileName: "video.mp4"
        });

        // Cleanup
        fs.unlinkSync(tempPath);
        await bot.api.deleteMessage(ctx.chat.id, statusMsg.message_id);

    } catch (err) {
        console.error(err);
        await ctx.reply("❌ Download Error: " + err.message);
    }
});

(async () => {
    console.log("Connecting MTProto Client...");
    await client.start({ botAuthToken: BOT_TOKEN });
    console.log("MTProto Connected.");
    bot.start();
    console.log("Grammy Bot Started.");
})();
