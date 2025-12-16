# 🎵 Discord Music Bot

**🌐 Language: [English](README.md) | [Indonesia](README_ID.md)**

---

A Discord music bot powered by Lavalink for high-quality audio streaming from YouTube and other platforms.

## ✨ Features

- 🎶 Play music from YouTube (search or direct URL)
- 📋 Queue system with shuffle
- 🔁 Loop mode (track / queue / off)
- 🔊 Volume control
- ⏯️ Pause, Resume, Skip, Stop
- 📊 Now Playing with progress bar
- 🚀 Auto-leave when queue is empty

## 📋 Commands

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
| `/leave` | Leave the voice channel |

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

### Step 3: Setup Discord Bot

1. Open [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application or use an existing one
3. In the **Bot** section, copy the token and paste it into `DISCORD_TOKEN`
4. Enable intents:
   - ✅ SERVER MEMBERS INTENT
   - ✅ MESSAGE CONTENT INTENT
5. In **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Permissions: `Connect`, `Speak`, `Send Messages`, `Embed Links`
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
├── index.js          # Main bot file
├── package.json      # Dependencies
├── .env              # Environment variables (do not commit!)
├── .env.example      # Template environment variables
├── .gitignore        # Git ignore rules
└── README.md         # Documentation
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

### Songs won't play
- YouTube might be blocking requests. Ensure Lavalink is using the latest `youtube-plugin`
- Check Lavalink logs for detailed errors

### Commands don't appear
- Wait a few minutes, Discord caches slash commands
- Make sure the bot has `applications.commands` permission

## 📄 License

ISC

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first.
