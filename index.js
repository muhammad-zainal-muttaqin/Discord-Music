const { Client, GatewayIntentBits, Events, MessageFlags } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, entersState, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const { createReadStream } = require('node:fs');
const { join } = require('node:path');
require('dotenv').config();

// Global error handling to prevent crashes
process.on('unhandledRejection', error => {
    console.error('Unhandled Rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught Exception:', error);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

client.on(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    // Register the /join command globally
    const data = [
        {
            name: 'join',
            description: 'Joins your voice channel',
        },
    ];

    try {
        await client.application.commands.set(data);
        console.log('Slash commands registered!');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

// Helper function to play silence for keep-alive
function playSilence(connection) {
    const player = createAudioPlayer();
    connection.subscribe(player);
    return player;
}

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'join') {
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            await interaction.reply({ content: 'You need to be in a voice channel first!', flags: MessageFlags.Ephemeral });
            return;
        }

        try {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false
            });

            // Start "Keep-Alive" logic
            playSilence(connection);

            await interaction.reply({ content: `Joined <#${voiceChannel.id}>! I will stay here 24/7.`, flags: MessageFlags.Ephemeral });

            connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
                try {
                    await Promise.race([
                        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                    ]);
                    // Seems to be reconnecting to a new channel - ignore disconnect
                } catch (error) {
                    try {
                        // Try to manually reconnect if actual disconnect happened
                        connection.destroy();
                        // Optional: trigger a fresh join if you stored the channel info globally
                        // For now, we destroy to clean up and avoid zombie connections
                    } catch (e) {
                        console.error('Error during disconnect cleanup:', e);
                    }
                }
            });

        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Failed to join voice channel!', flags: MessageFlags.Ephemeral });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
