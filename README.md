# Video Download Guide

This guide explains how to identify and download the lowest quality format for the following videos:
1. `https://animecube.live/anime/the-gate-of-mystical-realm?season=tab-1&episode=the-gate-of-mystical-realm-tab-1-ep-23`
2. `https://www.dailymotion.com/video/xa5kn9e`

**Note:** Both URLs point to the same content. The Animecube page embeds the Dailymotion video.

## How the Lowest Format was Identified

To identify the formats, I used the internal API of `savethevideo.com`. This service provides a way to extract all available stream manifests for a given URL.

### API Workflow:
1. **Task Creation:** Send a `POST` request to `https://api.v02.savethevideo.com/tasks` with the payload `{"type": "info", "url": "https://www.dailymotion.com/video/xa5kn9e"}`.
2. **Polling:** Poll `GET https://api.v02.savethevideo.com/tasks/{id}` until the state reaches `completed`.
3. **Extraction:** The result contains a list of `formats`.

### Lowest Format Details:
- **Resolution:** **512x288** (288p)
- **Extracted URL:** A `.m3u8` HLS manifest link provided in the API response under the lowest resolution entry.

## How to Download the Video

Since the video is served via HLS (`.m3u8`), standard tools like `curl` are not enough because they only download the manifest.

### Steps to Download:
1. **Tool:** Use `yt-dlp`.
2. **Command:**
   ```bash
   yt-dlp -o video_lowest.mp4 "MANIFEST_URL_FROM_API"
   ```
   *Note: This command will download all segments and mux them into a single MP4 file.*

## Summary for Developer
To automate this in a Telegram bot:
- Call the `savethevideo.com` API programmatically.
- Parse the JSON response to find the format with the smallest dimensions.
- Pass the HLS URL to `yt-dlp` to perform the download.

## Handling Telegram's 50MB File Limit
The standard Telegram Bot API has a **50MB upload limit**. If the lowest quality video still exceeds this limit, here are the three recommended strategies:

### 1. Use a Local Telegram Bot API Server (Recommended)
You can run your own instance of the [telegram-bot-api](https://github.com/tdlib/telegram-bot-api) server.
- **Benefit:** Increases the upload limit from **50MB to 2000MB (2GB)**.
- **Implementation:** Run the server locally or via Docker and point your bot's base URL to your local server instead of `https://api.telegram.org`.

### 2. Use MTProto Libraries
Instead of using the standard Bot API (HTTP-based), use a library that communicates directly via Telegram's MTProto protocol (the same protocol used by official apps).
- **Libraries:** [GramJS](https://github.com/gram-js/gramjs) (Node.js), [Telethon](https://github.com/LonamiWebs/Telethon) (Python), or [Pyrogram](https://github.com/pyrogram/pyrogram) (Python).
- **Benefit:** These libraries can upload files up to **2GB** (standard) or **4GB** (if the bot/user has Telegram Premium).

### 3. Video Compression or Splitting
If you cannot change your infrastructure:
- **Compression:** Use `ffmpeg` to lower the bitrate further.
  ```bash
  ffmpeg -i video_lowest.mp4 -vcodec libx264 -crf 28 compressed.mp4
  ```
- **Splitting:** Use `yt-dlp` or `ffmpeg` to split the video into smaller parts (e.g., Part 1, Part 2) each under 50MB.

## Technical Requirements for Large File Support

### For Local Telegram Bot API Server
To host the server yourself, you need:
1.  **Hardware:** A VPS or local server with at least:
    *   **CPU:** 1 vCPU (minimum).
    *   **RAM:** 512MB - 1GB (depending on the volume of files).
    *   **Storage:** Sufficient disk space to cache the files during upload/download (at least 2x the size of your largest video).
2.  **OS:** Linux (Ubuntu/Debian recommended) or Docker installed.
3.  **Dependencies:** `g++`, `cmake`, `gperf`, `libssl-dev`, `zlib1g-dev` (if building from source) or simply `Docker`.
4.  **Network:** A public IP and port `443` or `8081` open to receive requests from your bot.

### For MTProto Integration
To use libraries like Telethon, Pyrogram, or GramJS, you need:
1.  **Credentials:**
    *   **API ID** and **API Hash**: You must obtain these from [my.telegram.org](https://my.telegram.org) by creating a "Development Application".
2.  **Bot Token:** Your standard `@BotFather` token.
3.  **Environment:**
    *   Python 3.x (for Telethon/Pyrogram) or Node.js (for GramJS).
    *   Persistent storage for the **Session File** (a `.session` file created on first login that stores your authentication).
4.  **Security:** Since MTProto can perform more actions than the Bot API, keep your `API Hash` and `.session` files private.

## Hosting on Vercel
You **can** use Vercel to host the *logic* of your Telegram bot (using Webhooks), but it is **not recommended** for a bot that downloads and processes videos for the following reasons:

### 1. Execution Time Limits
*   **Vercel Hobby Plan:** Maximum 10 seconds execution time.
*   **Vercel Pro Plan:** Maximum 60-300 seconds.
*   *Issue:* Downloading a video, even at 288p, and muxing it can easily exceed 10 seconds, causing the function to time out and fail.

### 2. Disk Space & Binaries
*   **Ephemeral Storage:** Vercel provides only **512MB** of `/tmp` space. If you download a large video or multiple videos simultaneously, you will run out of space.
*   **Binaries:** Bundling `yt-dlp` and `ffmpeg` into a Vercel serverless function is difficult and increases the function's cold start time and size (which has a 50MB limit for the compressed function itself).

### 3. Serverless Nature
*   Vercel functions are "stateless". They spin up and down. This makes it impossible to host a **Local Telegram Bot API Server** or maintain an **MTProto Session** easily without external persistent storage (like Redis or a Database).

### Recommended Alternatives
If you need to download and send videos, consider these "Platform as a Service" (PaaS) providers that allow long-running processes:
*   **Railway.app** (Very easy to use, supports Docker and long tasks).
*   **Render.com** (Supports Web Services with persistent disks).
*   **Hetzner / DigitalOcean / Linode** (Standard VPS - best for hosting the Local Bot API Server).
