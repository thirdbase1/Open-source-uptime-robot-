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
