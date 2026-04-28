const { Bot } = require("grammy");

// Use Environment Variables for the Bot Token
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error("Error: BOT_TOKEN environment variable is not set.");
    process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

async function callAPI(payload) {
    const res = await fetch("https://api.v02.savethevideo.com/tasks", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Referer": "https://www.savethevideo.com/",
            "Origin": "https://www.savethevideo.com"
        },
        body: JSON.stringify(payload)
    });
    return res.json();
}

async function pollTask(id) {
    while (true) {
        await new Promise(r => setTimeout(r, 2000));
        const res = await fetch("https://api.v02.savethevideo.com/tasks/" + id, {
            headers: {
                "Referer": "https://www.savethevideo.com/",
                "Origin": "https://www.savethevideo.com"
            }
        });
        const data = await res.json();
        if (data.state === "completed") return data.result;
        if (data.state === "failed") throw new Error(data.error ? data.error.message : "Task failed");
    }
}

bot.command("start", (ctx) => ctx.reply("Welcome! Send me a link from Dailymotion or Animecube to get the lowest quality download link."));

bot.on("message:text", async (ctx) => {
    const url = ctx.message.text.trim();
    if (!url.startsWith("http")) return ctx.reply("Please send a valid URL.");

    await ctx.reply("Extracting video information...");

    try {
        const infoTask = await callAPI({ type: "info", url: url });
        if (infoTask.code) throw new Error(infoTask.message);

        const infoResult = await pollTask(infoTask.id);

        if (!infoResult.formats || infoResult.formats.length === 0) {
            throw new Error("No formats found for this video.");
        }

        const lowest = infoResult.formats
            .filter(f => f.url || f.format_id)
            .reduce((p, c) => ((c.width || 9999) * (c.height || 9999) < (p.width || 9999) * (p.height || 9999)) ? c : p);

        await ctx.reply(`Found format: ${lowest.width}x${lowest.height}. Starting conversion...`);

        const dlTask = await callAPI({
            type: "download",
            url: url,
            format: lowest.format_id
        });
        if (dlTask.code) throw new Error(dlTask.message);

        const dlResult = await pollTask(dlTask.id);

        await ctx.reply(`Success! Your download link is ready:\n\n${dlResult.download_url}`);

    } catch (err) {
        console.error(err);
        await ctx.reply("Error: " + err.message);
    }
});

bot.start();
console.log("Bot is running...");
