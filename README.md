# 🎵 Discord Music Bot

Bot musik Discord dengan Lavalink untuk streaming audio berkualitas tinggi dari YouTube dan platform lainnya.

## ✨ Fitur

- 🎶 Play musik dari YouTube (search atau URL langsung)
- 📋 Queue system dengan shuffle
- 🔁 Loop mode (track / queue / off)
- 🔊 Volume control
- ⏯️ Pause, Resume, Skip, Stop
- 📊 Now Playing dengan progress bar
- 🚀 Auto-leave saat queue kosong

## 📋 Commands

| Command | Deskripsi |
|---------|-----------|
| `/play <query>` | Play lagu dari YouTube |
| `/skip` | Skip lagu saat ini |
| `/stop` | Stop dan hapus queue |
| `/pause` | Pause lagu |
| `/resume` | Resume lagu |
| `/queue` | Lihat antrian lagu |
| `/nowplaying` | Info lagu yang sedang diputar |
| `/volume <0-100>` | Atur volume |
| `/shuffle` | Acak queue |
| `/loop <mode>` | Loop: off / track / queue |
| `/leave` | Keluar dari voice channel |

## 🚀 Deployment ke Railway

### Langkah 1: Deploy Lavalink Server

1. Buka [Railway Lavalink Template](https://railway.com/template/lavalink)
2. Klik **Deploy Now**
3. Set environment variable:
   - `PASSWORD`: Password untuk autentikasi (contoh: `mysecretpassword`)
4. Tunggu deployment selesai
5. Catat **internal hostname** dari service Lavalink (format: `lavalink.railway.internal`)

### Langkah 2: Deploy Discord Bot

1. Fork atau push repository ini ke GitHub
2. Di Railway, buat **New Project** → **Deploy from GitHub repo**
3. Pilih repository ini
4. Set environment variables:

```
DISCORD_TOKEN=your_discord_bot_token
LAVALINK_HOST=lavalink.railway.internal:2333
LAVALINK_PASSWORD=mysecretpassword
LAVALINK_SECURE=false
```

> **Note**: Ganti `lavalink.railway.internal` dengan hostname internal dari Lavalink service Anda.

5. Deploy!

### Langkah 3: Setup Discord Bot

1. Buka [Discord Developer Portal](https://discord.com/developers/applications)
2. Buat aplikasi baru atau gunakan yang sudah ada
3. Di bagian **Bot**, copy token dan paste ke `DISCORD_TOKEN`
4. Enable intents:
   - ✅ SERVER MEMBERS INTENT
   - ✅ MESSAGE CONTENT INTENT
5. Di bagian **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Permissions: `Connect`, `Speak`, `Send Messages`, `Embed Links`
6. Copy URL dan invite bot ke server Anda

## 🖥️ Local Development

### Prerequisites
- Node.js 18+
- Java 17+ (untuk Lavalink)
- Lavalink server berjalan

### Setup

1. Clone repository
```bash
git clone <your-repo-url>
cd Discord-Music
```

2. Install dependencies
```bash
npm install
```

3. Copy `.env.example` ke `.env` dan isi nilai-nilainya
```bash
cp .env.example .env
```

4. Jalankan Lavalink server (di terminal terpisah)
```bash
java -jar Lavalink.jar
```

5. Jalankan bot
```bash
npm start
```

## 📁 Struktur Proyek

```
Discord-Music/
├── index.js          # Main bot file
├── package.json      # Dependencies
├── .env              # Environment variables (jangan di-commit!)
├── .env.example      # Template environment variables
├── .gitignore        # Git ignore rules
└── README.md         # Dokumentasi
```

## ⚙️ Konfigurasi Lavalink (Opsional)

Jika Anda menjalankan Lavalink server sendiri, buat file `application.yml`:

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

### Bot tidak bisa connect ke Lavalink
- Pastikan Lavalink server berjalan
- Cek `LAVALINK_HOST` dan `LAVALINK_PASSWORD` sudah benar
- Di Railway, gunakan **internal URL** bukan public URL

### Lagu tidak bisa diputar
- YouTube mungkin memblokir. Pastikan Lavalink menggunakan `youtube-plugin` terbaru
- Cek logs Lavalink untuk error detail

### Commands tidak muncul
- Tunggu beberapa menit, Discord caching slash commands
- Pastikan bot memiliki permission `applications.commands`

## 📄 License

ISC

## 🤝 Contributing

Pull requests welcome! Untuk perubahan besar, buka issue terlebih dahulu.
