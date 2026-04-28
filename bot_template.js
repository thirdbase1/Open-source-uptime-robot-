/**
 * TEMPLATE: Telegram Video Download Bot (Vercel Sandbox Edition)
 *
 * Instructions:
 * 1. Install dependencies: npm install grammy @vercel/sandbox
 * 2. Set Environment Variables: BOT_TOKEN, VERCEL_API_TOKEN
 */

const { Bot } = require("grammy");
const { createSandbox } = require("@vercel/sandbox");

const bot = new Bot(process.env.BOT_TOKEN);

bot.command("start", (ctx) => ctx.reply("Send me a Dailymotion or Animecube link to download the lowest quality format!"));

bot.on("message:text", async (ctx) => {
    // Sanitize input to prevent injection
    const rawUrl = ctx.message.text.trim();
    const url = rawUrl.replace(/['"`]/g, "");

    if (!url.includes("dailymotion.com") && !url.includes("animecube.live")) {
        return ctx.reply("Please send a valid Dailymotion or Animecube link.");
    }

    await ctx.reply("Analyzing video... identifying lowest format...");

    try {
        const sandbox = await createSandbox({
            template: "node"
        });

        // 1. Create the download script file in the sandbox
        // We use JSON.stringify to safely embed the URL into the script
        await sandbox.writeFile("download.js", `
            const { execSync } = require('child_process');

            async function run() {
                const url = ${JSON.stringify(url)};
                console.log("Starting extraction for " + url);

                const apiRes = await fetch("https://api.v02.savethevideo.com/tasks", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ type: "info", url: url })
                });
                const { id } = await apiRes.json();

                let result;
                while(true) {
                    await new Promise(r => setTimeout(r, 2000));
                    const poll = await fetch("https://api.v02.savethevideo.com/tasks/" + id);
                    const data = await poll.json();
                    if (data.state === "completed") {
                        result = data.result;
                        break;
                    }
                }

                const lowest = result.formats
                    .filter(f => f.url)
                    .reduce((p, c) => ((c.width||0)*(c.height||0) < (p.width||0)*(p.height||0)) ? c : p);

                console.log("Downloading lowest format: " + lowest.url);

                // Install yt-dlp binary
                execSync("curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o yt-dlp && chmod a+rx yt-dlp");

                // Download the video
                execSync("./yt-dlp -o video.mp4 '" + lowest.url + "'");

                console.log("Download complete. File is ready at video.mp4");
                // TODO: Your developer would add the MTProto upload code here
            }
            run().catch(e => { console.error(e); process.exit(1); });
        `);

        await ctx.reply("Sandbox started! Downloading video... this may take a minute.");

        // 2. RUN the script inside the sandbox
        const execution = await sandbox.run("node download.js");

        // Listen for output
        execution.stdout.on("data", (data) => console.log("Sandbox STDOUT:", data));
        execution.stderr.on("data", (data) => console.error("Sandbox STDERR:", data));

        // Wait for completion
        await execution.done();

    } catch (err) {
        console.error(err);
        await ctx.reply("Error: " + err.message);
    }
});

// For Vercel Serverless, use webhookCallback
// bot.start();
console.log("Bot template ready. Use Environment Variables for BOT_TOKEN.");
