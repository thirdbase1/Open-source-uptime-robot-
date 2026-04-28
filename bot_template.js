/**
 * TEMPLATE: Telegram Video Download Bot (Vercel Sandbox Edition)
 *
 * Instructions:
 * 1. Install dependencies: npm install grammy @vercel/sandbox
 * 2. Set Environment Variables: BOT_TOKEN, VERCEL_API_TOKEN
 */

const { Bot } = require("grammy");
const { Sandbox } = require("@vercel/sandbox");

const bot = new Bot(process.env.BOT_TOKEN);

bot.command("start", (ctx) => ctx.reply("Send me a Dailymotion or Animecube link to download the lowest quality format!"));

bot.on("message:text", async (ctx) => {
    const url = ctx.message.text.trim();

    if (!url.includes("dailymotion.com") && !url.includes("animecube.live")) {
        return ctx.reply("Please send a valid Dailymotion or Animecube link.");
    }

    await ctx.reply("Analyzing video... identifying lowest format...");

    try {
        const sandbox = await Sandbox.create({
            runtime: "node22"
        });

        // 1. Create the download script file in the sandbox
        await sandbox.fs.writeFile("download.js", `
            async function run() {
                const url = ${JSON.stringify(url)};

                // Step A: Request video info to find the lowest format
                const infoRes = await fetch("https://api.v02.savethevideo.com/tasks", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ type: "info", url: url })
                });
                const infoData = await infoRes.json();

                let infoResult;
                while(true) {
                    await new Promise(r => setTimeout(r, 2000));
                    const poll = await fetch("https://api.v02.savethevideo.com/tasks/" + infoData.id);
                    const data = await poll.json();
                    if (data.state === "completed") { infoResult = data.result; break; }
                    if (data.state === "failed") throw new Error("Info extraction failed");
                }

                // Dynamically find the lowest format
                const lowest = infoResult.formats
                    .filter(f => f.url || f.format_id)
                    .reduce((p, c) => ((c.width||9999)*(c.height||9999) < (p.width||9999)*(p.height||9999)) ? c : p);

                console.log("Found lowest format: " + lowest.format_id);

                // Step B: Request a server-side conversion for a direct MP4 download link
                const dlRes = await fetch("https://api.v02.savethevideo.com/tasks", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        type: "download",
                        url: url,
                        format: lowest.format_id
                    })
                });
                const dlData = await dlRes.json();

                let dlResult;
                while(true) {
                    await new Promise(r => setTimeout(r, 2000));
                    const poll = await fetch("https://api.v02.savethevideo.com/tasks/" + dlData.id);
                    const data = await poll.json();
                    if (data.state === "completed") { dlResult = data.result; break; }
                    if (data.state === "failed") throw new Error("Conversion failed");
                }

                // Return the direct download URL to the main process via stdout
                console.log("DOWNLOAD_URL:" + dlResult.download_url);
            }
            run().catch(e => { console.error(e); process.exit(1); });
        `);

        await ctx.reply("Sandbox started! Converting video... please wait.");

        // 2. RUN the script inside the sandbox and capture the URL
        const cmd = await sandbox.runCommand("node download.js");

        let downloadUrl = null;
        cmd.stdout.on("data", (data) => {
            const line = data.toString();
            if (line.includes("DOWNLOAD_URL:")) {
                downloadUrl = line.split("DOWNLOAD_URL:")[1].trim();
            }
        });

        // Wait for completion
        await cmd.done();

        if (downloadUrl) {
            await ctx.reply(`Conversion complete! You can download the video here:\n${downloadUrl}`);
            // Optional: The developer can use MTProto here to upload the file directly if preferred.
        } else {
            throw new Error("Could not retrieve download URL from sandbox.");
        }

    } catch (err) {
        console.error(err);
        await ctx.reply("Error: " + err.message);
    }
});

// For Vercel Serverless, use webhookCallback
// bot.start();
console.log("Bot template ready. Use Environment Variables for BOT_TOKEN.");
