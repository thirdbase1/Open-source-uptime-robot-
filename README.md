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
