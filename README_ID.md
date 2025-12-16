# 🎵 Discord Music Bot

**🌐 Bahasa: [English](README.md) | [Indonesia](README_ID.md)**

---

Bot musik Discord dengan fitur lengkap, didukung oleh Lavalink untuk streaming audio berkualitas tinggi. Terinspirasi dari bot Boogie dengan panel player interaktif yang cantik!

## ✨ Fitur

### 🎶 Fitur Musik Utama
- 🎵 Play musik dari YouTube (search atau URL langsung)
- 📋 Sistem queue dengan shuffle
- 🔁 Mode loop (track / queue / off)
- 🔊 Kontrol volume (0-100%)
- ⏯️ Pause, Resume, Skip, Stop
- 📊 Now Playing dengan progress bar real-time
- 🎧 Tetap di voice channel (tidak auto-leave)

### 🎛️ Panel Player Interaktif (Gaya Boogie)
- **Progress Bar Real-time** - Update setiap 10 detik menampilkan posisi saat ini
- **Hitungan Queue Live** - Update langsung saat lagu ditambahkan
- **Tombol Kontrol:**
  - ⏮️ Restart Track
  - ⏸️/▶️ Pause/Resume (ikon dinamis)
  - ⏭️ Skip
  - ⏹️ Stop
  - 🔀 Shuffle
  - 🔉/🔊 Volume Turun/Naik
  - 🔁 Loop (berubah warna saat aktif)
  - ❤️ Favorit
  - 📋 Lihat Queue

### 📀 Menu Dropdown
- **Lihat Track Queue** - Jelajahi hingga 25 track dalam queue
- **Fitur Lainnya:**
  - 📍 Seek ke posisi (instruksi)
  - 🎵 Info Now Playing detail
  - 🗑️ Clear Queue
  - 🔄 Restart Track
  - 📊 Statistik Player

### 🧹 Pengalaman Chat Bersih
- Semua pesan bot otomatis terhapus setelah 5 detik
- Panel player tetap ada (edit di tempat)
- Tidak ada spam chat!

## 📋 Slash Commands

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
| `/join` | Masuk voice channel dan tetap di sana |
| `/leave` | Keluar dari voice channel |

## 🎮 Preview Panel Player

```
🎧 Music Player
─────────────────────────────────
Judul Lagu

Author: Nama Artis
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
   - Permissions: `Connect`, `Speak`, `Send Messages`, `Embed Links`, `Manage Messages`
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
├── index.js          # Main bot file dengan panel player
├── package.json      # Dependencies
├── .env              # Environment variables (jangan di-commit!)
├── .env.example      # Template environment variables
├── .gitignore        # Git ignore rules
├── README.md         # Dokumentasi English
└── README_ID.md      # Dokumentasi Indonesia
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

### Pesan tidak otomatis terhapus
- Pastikan bot memiliki permission `Manage Messages`

### Panel player tidak update
- Player update setiap 10 detik saat bermain
- Update berhenti saat musik di-pause

## 🆕 Yang Baru

### v2.0 - Panel Player Interaktif
- ✨ Panel player interaktif gaya Boogie dengan tombol-tombol
- 📊 Progress bar real-time (update setiap 10 detik)
- 🔘 Tombol kontrol untuk semua fungsi playback
- 📀 Menu dropdown untuk queue dan fitur tambahan
- 🧹 Pesan otomatis terhapus setelah 5 detik
- 🔄 Player edit di tempat (tidak ada pesan "message deleted")
- 📋 Update hitungan queue secara live

## 📄 License

ISC

## 🤝 Contributing

Pull requests welcome! Untuk perubahan besar, buka issue terlebih dahulu.

---

Dibuat dengan ❤️ untuk pecinta musik Discord
