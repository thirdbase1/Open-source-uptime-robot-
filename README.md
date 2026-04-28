# Telegram Video Download Bot (Direct API + MTProto)

A high-performance Telegram bot that downloads videos from Dailymotion and Animecube at your preferred resolution, bypassing Telegram's standard 50MB file size limit.

## Key Features
- **Direct API Integration:** Interacts directly with the `savethevideo.com` v02 API for format extraction and server-side conversion.
- **MTProto Support:** Uses `gramJS` to upload files up to 2GB, bypassing the standard Bot API limitations.
- **Interactive UI:** Provides inline buttons for users to select their desired resolution.
- **OOM Stability:** Uses disk-based streaming to handle large video files without crashing the Node.js process.
- **Rate-Limit Mitigation:** Implements randomized User-Agent headers and automatic retry logic for 429 errors.

## How it Works
1.  **Extraction:** The bot sends the URL to the API to identify all available formats.
2.  **Selection:** Formats are sorted by resolution (lowest first) and presented via Inline Buttons.
3.  **Conversion:** The API performs server-side conversion to provide a direct MP4 link.
4.  **Delivery:** The bot streams the MP4 to a temporary file and uploads it to the user via MTProto.

## Technical Details
- **Language:** Node.js
- **Bot Framework:** [grammY](https://grammy.dev/)
- **MTProto Library:** [gramJS](https://gram.js.org/)
- **API:** savethevideo.com v02 Internal API

## Setup Instructions
1.  **Install Dependencies:**
    ```bash
    npm install grammy telegram
    ```
2.  **Configuration:**
    The following credentials must be configured (currently hardcoded for testing):
    - `BOT_TOKEN`
    - `API_ID`
    - `API_HASH`
3.  **Run:**
    ```bash
    node bot.js
    ```
