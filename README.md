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
- **Framework:** [grammY](https://grammy.dev/)
- **API:** savethevideo.com v02 Internal API
- **No Dependencies:** No browser automation, no media binaries, no external scrapers.

## Running the Bot
1.  Install the only dependency:
    ```bash
    npm install grammy
    ```
2.  Run the bot:
    ```bash
    node bot.js
    ```
    *(The bot in this repository is pre-configured with your token and is currently running for testing.)*
