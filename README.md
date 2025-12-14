# Discord AFK Bot

A simple Discord bot that joins a voice channel using the `/join` command and stays there to prevent AFK disconnections.

## Prerequisites

- [Node.js](https://nodejs.org/) (v16.11.0 or higher)
- A Discord Bot Token (from [Discord Developer Portal](https://discord.com/developers/applications))

## Setup

1.  Clone or download this repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create a `.env` file in the root directory (copy from default if available) and add your bot token:
    ```env
    DISCORD_TOKEN=your_token_here
    ```

## Running the Bot

Start the bot using:
```bash
node index.js
```

## Usage

1.  **Join a Voice Channel**: User must be in a voice channel.
2.  **Command**: Type `/join` in any text channel the bot can see.
3.  **Result**: The bot will join your channel and stay connected.

## Roadmap: Music Support

To enable the bot to play music, the following features are planned:

1.  **Music Dependencies**: Install `ytdl-core` (or a better alternative like `play-dl` due to YouTube restrictions) and `ffmpeg-static`.
2.  **Audio Player**: Implement `createAudioPlayer` and `createAudioResource` from `@discordjs/voice`.
3.  **Command Expansion**:
    - `/play <url>`: To stream music from a URL.
    - `/stop`: To stop playing and clear the queue.
4.  **Queue System**: Implement a queue to manage multiple song requests.
