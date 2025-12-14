const { Client, GatewayIntentBits, Events, MessageFlags } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
require('dotenv').config();

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

            await interaction.reply({ content: `Joined <#${voiceChannel.id}>!`, flags: MessageFlags.Ephemeral });

            // Optional: Handle disconnection or add logic to stay alive
            connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
                try {
                    await Promise.race([
                        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                    ]);
                    // Seems to be reconnecting to a new channel - ignore disconnect
                } catch (error) {
                    // Seems to be a real disconnect which SHOULDN'T happen unless kicked
                    connection.destroy();
                }
            });

        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Failed to join voice channel!', flags: MessageFlags.Ephemeral });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
