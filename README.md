# 🎵 Discord Music Bot

**🌐 Language: [English](README.md) | [Indonesia](README_ID.md) | [日本語](README_jp.md)**

---

A feature-rich Discord music bot powered by Lavalink for high-quality audio streaming. Inspired by Boogie bot with a beautiful interactive player panel!

## ✨ Features

### 🎶 Core Music Features
- 🎵 Play music from YouTube (search or direct URL)
- 📋 Queue system with shuffle support
- 🔁 Loop modes (track / queue / off)
- 🔊 Volume control (0-100%)
- ⏯️ Pause, Resume, Skip, Stop
- 📊 Now Playing with real-time progress bar
- 🎧 Stay in voice channel (no auto-leave)

### 🎛️ Interactive Player Panel (Boogie-style)
- **Real-time Progress Bar** - Updates every 10 seconds showing current position
- **Live Queue Count** - Updates instantly when songs are added
- **Control Buttons:**
  - ⏮️ Restart Track
  - ⏸️/▶️ Pause/Resume (dynamic icon)
  - ⏭️ Skip
  - ⏹️ Stop
  - 🔀 Shuffle
  - 🔉/🔊 Volume Down/Up
  - 🔁 Loop (changes color when active)
  - ❤️ Favorite
  - 📋 View Queue

### 📀 Dropdown Menus
- **View Queue Tracks** - Browse up to 25 tracks in queue
- **More Features:**
  - 📍 Seek to position (instructions)
  - 🎵 Detailed Now Playing info
  - 🗑️ Clear Queue
  - 🔄 Restart Track
  - 📊 Player Statistics

### 🧹 Clean Chat Experience
- All bot messages auto-delete after 5 seconds
- Player panel stays persistent (edits in-place)
- No chat clutter!

## 📋 Slash Commands

| Command | Description |
|---------|-------------|
| `/play <query>` | Play a song from YouTube |
| `/skip` | Skip the current song |
| `/stop` | Stop playback and clear the queue |
| `/pause` | Pause the song |
| `/resume` | Resume the song |
| `/queue` | View the song queue |
| `/nowplaying` | Show info about the currently playing song |
| `/volume <0-100>` | Set the volume |
| `/shuffle` | Shuffle the queue |
| `/loop <mode>` | Loop: off / track / queue |
| `/join` | Join voice channel and stay |
| `/leave` | Leave the voice channel |

## 🎮 Player Panel Preview

```
🎧 Music Player
─────────────────────────────────
Song Title

Author: Artist Name
Requested by: Username

▬▬▬▬▬🔘▬▬▬▬▬▬
`1:45` / `4:31`

🎶 Queue: 3 tracks remaining • Volume: 80% • ▶️ Playing
─────────────────────────────────
[⏮️] [⏸️] [⏭️] [⏹️] [🔀]
[🔉] [🔊] [🔁] [❤️] [📋]
[📀 View Queue Tracks (3)      ▼]
[⚡ More Features...           ▼]
```

## 🚀 Deployment to Railway

### Step 1: Deploy Lavalink Server

1. Open [Railway Lavalink Template](https://railway.com/template/lavalink)
2. Click **Deploy Now**
3. Set environment variable:
   - `PASSWORD`: Password for authentication (e.g., `mysecretpassword`)
4. Wait for deployment to complete
5. Note down the **internal hostname** of the Lavalink service (format: `lavalink.railway.internal`)

### Step 2: Deploy Discord Bot

1. Fork or push this repository to GitHub
2. In Railway, create a **New Project** → **Deploy from GitHub repo**
3. Select this repository
4. Set environment variables:

```
DISCORD_TOKEN=your_discord_bot_token
LAVALINK_HOST=lavalink.railway.internal:2333
LAVALINK_PASSWORD=mysecretpassword
LAVALINK_SECURE=false
```

> **Note**: Replace `lavalink.railway.internal` with the internal hostname of your Lavalink service.

5. Deploy!

### Step 3: Configure YouTube Plugin (Important!)

To fix "This video requires login" or "Please sign in" errors, add these environment variables to your **Lavalink** service:

**Required for YouTube playback:**
```
PLUGINS_YOUTUBE_ENABLED=true
PLUGINS_YOUTUBE_REMOTECIPHER_ENABLED=true
PLUGINS_YOUTUBE_REMOTECIPHER_URL=https://cipher.kikkia.dev/
PLUGINS_YOUTUBE_CLIENTS_0=WEB
PLUGINS_YOUTUBE_CLIENTS_1=MWEB
PLUGINS_YOUTUBE_CLIENTS_2=TVHTML5EMBEDDED
```

**Optional but recommended - OAuth setup:**
```
PLUGINS_YOUTUBE_OAUTH_ENABLED=true
```

When you first enable OAuth without a refresh token:
1. Check Lavalink logs for a device code (like `XXX-XXX-XXX`)
2. Go to https://www.google.com/device
3. Enter the code and login with a **BURNER Google account** (not your main!)
4. Copy the refresh token from the logs
5. Add it to: `PLUGINS_YOUTUBE_OAUTH_REFRESHTOKEN=1//...`

> ⚠️ **WARNING:** Never use your main Google account for OAuth. Create a new/burner account!

### Step 4: Setup Discord Bot

1. Open [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application or use an existing one
3. In the **Bot** section, copy the token and paste it into `DISCORD_TOKEN`
4. Enable intents:
   - ✅ SERVER MEMBERS INTENT
   - ✅ MESSAGE CONTENT INTENT
5. In **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Permissions: `Connect`, `Speak`, `Send Messages`, `Embed Links`, `Manage Messages`
6. Copy the URL and invite the bot to your server

## 🖥️ Local Development

### Prerequisites
- Node.js 18+
- Java 17+ (for Lavalink)
- Lavalink server running

### Setup

1. Clone the repository
```bash
git clone <your-repo-url>
cd Discord-Music
```

2. Install dependencies
```bash
npm install
```

3. Copy `.env.example` to `.env` and fill in the values
```bash
cp .env.example .env
```

4. Run Lavalink server (in a separate terminal)
```bash
java -jar Lavalink.jar
```

5. Run the bot
```bash
npm start
```

## 📁 Project Structure

```
Discord-Music/
├── index.js          # Main bot file with player panel
├── package.json      # Dependencies
├── .env              # Environment variables (do not commit!)
├── .env.example      # Template environment variables
├── .gitignore        # Git ignore rules
├── README.md         # English documentation
└── README_ID.md      # Indonesian documentation
```

## ⚙️ Lavalink Configuration (Optional)

If you're running your own Lavalink server, create an `application.yml` file:

```yaml
server:
  port: 2333
  address: 0.0.0.0

lavalink:
  plugins:
    - dependency: "dev.lavalink.youtube:youtube-plugin:1.5.0"
      snapshot: false
  server:
    password: "youshallnotpass"
    sources:
      youtube: true
      bandcamp: true
      soundcloud: true
      twitch: true
      vimeo: true
      http: true
      local: false

logging:
  level:
    root: INFO
    lavalink: INFO
```

## 🔧 Troubleshooting

### Bot can't connect to Lavalink
- Make sure the Lavalink server is running
- Check that `LAVALINK_HOST` and `LAVALINK_PASSWORD` are correct
- On Railway, use the **internal URL**, not the public URL

### Songs won't play / "Please sign in" error
- This is a common issue with YouTube blocking automated access
- **Solution 1:** Enable remote cipher: `PLUGINS_YOUTUBE_REMOTECIPHER_URL=https://cipher.kikkia.dev/`
- **Solution 2:** Setup OAuth with a burner Google account (see Step 3 above)
- **Solution 3:** Try different clients: `WEB`, `MWEB`, `TVHTML5EMBEDDED`
- Check Lavalink logs for detailed errors

### Commands don't appear
- Wait a few minutes, Discord caches slash commands
- Make sure the bot has `applications.commands` permission

### Messages not auto-deleting
- Ensure the bot has `Manage Messages` permission

### "The music service is temporarily unavailable" on every `/play`
- This was caused by a wrong Shoukaku state value. Shoukaku 4.x uses `CONNECTED=1`, not `2`. Check `isNodeStateConnected()` in `index.js` — it must check `state === 1`.
- If you upgraded Shoukaku, always verify the `State` enum in its `Constants.ts`.

### Bot stuck reconnecting / never recovers after Lavalink drop
- Caused by the `isReconnecting` flag being set by the `close` event, which also blocked `attemptReconnect()` from running. Now fixed with a separate `reconnectAttemptInProgress` mutex.

### `/play` shows "still starting up" even after bot is running
- The `isStartingUp` flag is only cleared when `ready` fires. If `ready` never fires (e.g., Lavalink not reachable), the flag stays `true`. Check that `LAVALINK_HOST`, `LAVALINK_PASSWORD`, and `LAVALINK_SECURE` are correct.

### Railway: using public URL vs internal URL
- **Internal URL** (`*.railway.internal`): use port `2333`, set `LAVALINK_SECURE=false`
- **Public URL** (`*.up.railway.app`): use port `443`, set `LAVALINK_SECURE=true`

### Player panel not updating
- The player updates every 10 seconds while playing
- Updates pause when music is paused

## 🆕 What's New

### v2.2 - Lavalink Reconnection Fixes (February 2026)

- 🔧 **Critical fix: Shoukaku 4.x state enum** — Shoukaku 4.x uses `CONNECTED=1`, not `2`. The bot was checking the wrong value, so `isNodeOperational()` always returned `false` even when fully connected. This caused `/play` to always show "temporarily unavailable".
- 🔧 **Fixed reconnect mutex** — Split `isReconnecting` into two separate flags: `isReconnecting` (user-facing state) and `reconnectAttemptInProgress` (function mutex). Previously, the `close` event set `isReconnecting=true`, which caused `attemptReconnect()` to return immediately — the bot could never self-recover from a mid-session Lavalink drop.
- 🔧 **Fixed mutex timeout** — The 10-second mutex timeout was blocking legitimate retry attempts after a failed reconnect (e.g., 502 during Lavalink startup). Mutex is now released immediately after `addNode()`.
- ✨ **Smarter `/play` status messages** — Bot now shows context-aware messages: "still starting up" on first boot, "lost connection and is reconnecting" on mid-session drops, or "temporarily unavailable" for other cases.
- ✨ **`isStartingUp` flag** — Distinguishes fresh boot from mid-session reconnect so users get accurate status messages.

> **Note for maintainers:** If you upgrade Shoukaku, always verify the `State` enum values in `node_modules/shoukaku/src/Constants.ts`. The state numbers differ between versions. Current values (Shoukaku 4.x): `CONNECTING=0`, `CONNECTED=1`, `DISCONNECTING=2`, `DISCONNECTED=3`.

### v2.1 - YouTube OAuth & Remote Cipher (December 2025)
- 🔐 OAuth support for YouTube authentication (bypasses "Please sign in" errors)
- 🔧 Remote cipher server integration (fixes signature extraction issues)
- 📝 Updated documentation with detailed setup instructions
- 🎵 More reliable YouTube playback

### v2.0 - Interactive Player Panel
- ✨ Boogie-style interactive player with buttons
- 📊 Real-time progress bar (updates every 10 seconds)
- 🔘 Control buttons for all playback functions
- 📀 Dropdown menus for queue and extra features
- 🧹 Auto-delete messages after 5 seconds
- 🔄 Player edits in-place (no "message deleted" notices)
- 📋 Live queue count updates

## 📄 License

ISC

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first.

---

Made with ❤️ for Discord music lovers
