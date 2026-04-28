# Video Download Bot (Direct API)

This bot allows you to download videos from Dailymotion and Animecube using only direct API calls to `savethevideo.com`. No third-party tools (like yt-dlp or ffmpeg) or external hosting services (like Vercel) are required.

## How it Works
The bot is built with a pure API-only architecture:
1.  **Format Extraction:** It calls `https://api.v02.savethevideo.com/tasks` with `type: info` to get all available video formats.
2.  **Lowest Quality Selection:** It automatically finds the format with the smallest resolution (lowest width x height).
3.  **Server-Side Conversion:** It requests a direct download link from the API using `type: download`.
4.  **Direct Link:** The final MP4 download link is sent directly to the Telegram user.

## Technical Details
- **Language:** Node.js
- **Framework:** [grammY](https://grammy.dev/) for bot logic and [gramJS](https://gram.js.org/) (MTProto) for file uploads.
- **API:** savethevideo.com v02 Internal API.
- **Bypassing Limits:** Uses the MTProto protocol to upload files up to 2GB, bypassing the standard 50MB Bot API limit.

## Running the Bot
1.  Install dependencies:
    ```bash
    npm install grammy telegram
    ```
2.  Run the bot:
    ```bash
    node bot.js
    ```
    *(The bot in this repository is pre-configured with your token and is currently running for testing.)*

## Handling Large Files (Telegram 50MB Limit)
The standard Telegram Bot API has a **50MB upload limit**. If a video is larger than 50MB, this bot provides a **Direct Download Link** which the user can use to download files of any size.

### To send the file itself (Bypassing 50MB):
If you want the bot to send the actual video file (not just a link) even when it's > 50MB, your developer should use the **MTProto Protocol** instead of the standard Bot API.

#### Example code snippet for MTProto (Node.js):
```javascript
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

const client = new TelegramClient(new StringSession(""), API_ID, API_HASH);

async function uploadLargeFile(chatId, videoUrl) {
    const response = await fetch(videoUrl);
    const buffer = Buffer.from(await response.arrayBuffer());

    await client.sendFile(chatId, {
        file: buffer,
        caption: "Here is your large video!",
        fileName: "video.mp4"
    });
}
```
*Note: This requires an `API_ID` and `API_HASH` from [my.telegram.org](https://my.telegram.org).*
