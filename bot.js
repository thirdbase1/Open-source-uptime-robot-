const { Bot, InlineKeyboard } = require("grammy");

// Hardcoded Bot Token
const BOT_TOKEN = "8704490710:AAFaWVhJE9Re13AzVvritpKKTwTGB2BAmB0";
const bot = new Bot(BOT_TOKEN);

const HEADERS = {
    "Content-Type": "application/json",
    "Referer": "https://www.savethevideo.com/",
    "Origin": "https://www.savethevideo.com",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
};

async function callAPI(payload, retryCount = 0) {
    const res = await fetch("https://api.v02.savethevideo.com/tasks", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.code === 429 && retryCount < 3) {
        console.log(`Rate limited on callAPI. Retrying in 5s... (Attempt ${retryCount + 1})`);
        await new Promise(r => setTimeout(r, 5000));
        return callAPI(payload, retryCount + 1);
    }
    return data;
}

async function pollTask(id, retryCount = 0) {
    let attempts = 0;
    while (attempts < 40) {
        await new Promise(r => setTimeout(r, 2000));
        const res = await fetch("https://api.v02.savethevideo.com/tasks/" + id, { headers: HEADERS });
        const data = await res.json();

        if (data.code === 429 && retryCount < 3) {
            console.log(`Rate limited on pollTask. Retrying in 5s...`);
            await new Promise(r => setTimeout(r, 5000));
            return pollTask(id, retryCount + 1);
        }

        if (data.state === "completed") return data.result;
        if (data.state === "failed") {
            console.error("Task failed:", data);
            throw new Error(data.error ? data.error.message : "The external API failed to process the video.");
        }
        attempts++;
    }
    throw new Error("Polling timeout. The server is taking too long.");
}

bot.command("start", (ctx) => ctx.reply("Hello! Send me a Dailymotion or Animecube URL to download the video in your preferred resolution."));

bot.on("message:text", async (ctx) => {
    const url = ctx.message.text.trim();
    if (!url.startsWith("http")) return;

    await ctx.reply("🔍 Extracting video info...");

    try {
        const infoTask = await callAPI({ type: "info", url: url });
        if (infoTask.code) throw new Error(infoTask.message);

        const infoResult = await pollTask(infoTask.id);

        if (!infoResult.formats || infoResult.formats.length === 0) {
            throw new Error("No available formats found.");
        }

        const keyboard = new InlineKeyboard();
        // Dynamic format selection
        const formats = infoResult.formats.filter(f => f.width && f.height);
        formats.sort((a, b) => (a.width * a.height) - (b.width * b.height));

        formats.slice(0, 8).forEach((f, i) => {
            const label = `${f.width}x${f.height} (${f.ext || 'mp4'})`;
            keyboard.text(label, `dl:${infoTask.id}:${f.format_id}`).row();
        });

        await ctx.reply("✅ Info extracted! Choose a resolution:", { reply_markup: keyboard });

    } catch (err) {
        console.error(err);
        await ctx.reply("❌ Error: " + err.message + "\n\nNote: The API might be temporarily blocking requests. Please try again later.");
    }
});

bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!data.startsWith("dl:")) return;

    const [_, taskId, formatId] = data.split(":");
    await ctx.answerCallbackQuery("Starting conversion...");
    await ctx.editMessageText("⏳ Requesting download link from server...");

    try {
        // Fetch original URL from the task result
        const taskInfo = await fetch("https://api.v02.savethevideo.com/tasks/" + taskId, { headers: HEADERS });
        const taskData = await taskInfo.json();
        const videoUrl = taskData.result.url;

        const dlTask = await callAPI({
            type: "download",
            url: videoUrl,
            format: formatId
        });
        if (dlTask.code) throw new Error(dlTask.message);

        await ctx.editMessageText(`🚀 Converting video... this may take a moment.`);
        const dlResult = await pollTask(dlTask.id);

        await ctx.editMessageText(`✨ Done! Click below to download:\n\n[Download Video](${dlResult.download_url})\n\n_Note: Large files (>50MB) must be downloaded via this link directly._`, { parse_mode: "Markdown" });

    } catch (err) {
        console.error(err);
        await ctx.reply("❌ Download Error: " + err.message);
    }
});

bot.catch((err) => console.error("Global Error:", err));

bot.start();
console.log("Bot is running...");
