const { Client, GatewayIntentBits, Events, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Shoukaku, Connectors } = require('shoukaku');
const { Kazagumo, Plugins } = require('kazagumo');
require('dotenv').config();

// Global error handling to prevent crashes
process.on('unhandledRejection', error => {
    console.error('Unhandled Rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught Exception:', error);
});

// Lavalink Nodes Configuration
const Nodes = [
    {
        name: 'Lavalink',
        url: process.env.LAVALINK_HOST || 'localhost:2333',
        auth: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
        secure: process.env.LAVALINK_SECURE === 'true' || false
    }
];

// Discord Client Setup
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
    ],
});

// Kazagumo (Shoukaku wrapper) Setup
const kazagumo = new Kazagumo({
    defaultSearchEngine: 'youtube',
    plugins: [
        new Plugins.PlayerMoved(client)
    ],
    send: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
    }
}, new Connectors.DiscordJS(client), Nodes, {
    reconnectTries: 5,
    reconnectInterval: 5000,
    restTimeout: 60000,
    moveOnDisconnect: true,
    resume: true,
    resumeTimeout: 30,
    resumeByLibrary: true,
});

// Kazagumo Events
kazagumo.shoukaku.on('ready', (name) => {
    console.log(`✅ Lavalink Node "${name}" connected!`);
});

kazagumo.shoukaku.on('error', (name, error) => {
    console.error(`❌ Lavalink Node "${name}" error:`, error);
});

kazagumo.shoukaku.on('close', (name, code, reason) => {
    console.warn(`⚠️ Lavalink Node "${name}" closed: ${code} - ${reason}`);
});

kazagumo.shoukaku.on('disconnect', (name, players, moved) => {
    if (moved) {
        console.log(`🔄 Lavalink Node "${name}" players moved to another node`);
    } else {
        console.warn(`⚠️ Lavalink Node "${name}" disconnected`);
    }
});

// Player Events
kazagumo.on('playerStart', (player, track) => {
    const channel = client.channels.cache.get(player.textId);
    if (channel) {
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🎵 Now Playing')
            .setDescription(`**[${track.title}](${track.uri})**`)
            .addFields(
                { name: 'Duration', value: formatDuration(track.length), inline: true },
                { name: 'Author', value: track.author || 'Unknown', inline: true },
                { name: 'Requested by', value: track.requester?.tag || 'Unknown', inline: true }
            )
            .setThumbnail(track.thumbnail || null)
            .setTimestamp();

        channel.send({ embeds: [embed] }).catch(console.error);
    }
});

kazagumo.on('playerEnd', (player) => {
    // Queue is empty, will auto-handle
});

kazagumo.on('playerEmpty', (player) => {
    const channel = client.channels.cache.get(player.textId);
    if (channel) {
        const embed = new EmbedBuilder()
            .setColor(0xFFFF00)
            .setDescription('📭 Queue is empty! Add more songs to continue listening.')
            .setTimestamp();

        channel.send({ embeds: [embed] }).catch(console.error);
    }

    // Bot will stay in voice channel - no auto-leave
    // If you want auto-leave, uncomment the code below and set your desired timeout
    /*
    setTimeout(() => {
        if (player && player.queue.length === 0 && !player.playing) {
            player.destroy();
            if (channel) {
                channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xFF0000)
                            .setDescription('👋 Left voice channel due to inactivity.')
                    ]
                }).catch(console.error);
            }
        }
    }, 120000);
    */
});

kazagumo.on('playerDestroy', (player) => {
    console.log(`🗑️ Player destroyed for guild: ${player.guildId}`);
});

kazagumo.on('playerError', (player, error) => {
    console.error(`❌ Player error in guild ${player.guildId}:`, error);
    const channel = client.channels.cache.get(player.textId);
    if (channel) {
        channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setDescription(`❌ An error occurred: ${error.message}`)
            ]
        }).catch(console.error);
    }
});

// Helper function to format duration
function formatDuration(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Bot Ready Event
client.on(Events.ClientReady, async () => {
    console.log(`🤖 Logged in as ${client.user.tag}!`);

    // Register slash commands
    const commands = [
        {
            name: 'play',
            description: 'Play a song from YouTube',
            options: [
                {
                    name: 'query',
                    description: 'Song name or YouTube URL',
                    type: 3, // STRING
                    required: true
                }
            ]
        },
        {
            name: 'skip',
            description: 'Skip the current song'
        },
        {
            name: 'stop',
            description: 'Stop playing and clear the queue'
        },
        {
            name: 'pause',
            description: 'Pause the current song'
        },
        {
            name: 'resume',
            description: 'Resume the paused song'
        },
        {
            name: 'queue',
            description: 'Show the current queue'
        },
        {
            name: 'nowplaying',
            description: 'Show the currently playing song'
        },
        {
            name: 'volume',
            description: 'Set the volume',
            options: [
                {
                    name: 'level',
                    description: 'Volume level (0-100)',
                    type: 4, // INTEGER
                    required: true,
                    min_value: 0,
                    max_value: 100
                }
            ]
        },
        {
            name: 'shuffle',
            description: 'Shuffle the queue'
        },
        {
            name: 'loop',
            description: 'Toggle loop mode',
            options: [
                {
                    name: 'mode',
                    description: 'Loop mode',
                    type: 3, // STRING
                    required: true,
                    choices: [
                        { name: 'Off', value: 'none' },
                        { name: 'Track', value: 'track' },
                        { name: 'Queue', value: 'queue' }
                    ]
                }
            ]
        },
        {
            name: 'join',
            description: 'Join your voice channel and stay there'
        },
        {
            name: 'leave',
            description: 'Leave the voice channel'
        }
    ];

    try {
        await client.application.commands.set(commands);
        console.log('✅ Slash commands registered!');
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
});

// Handle Slash Commands
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, member, guild, channel } = interaction;
    const voiceChannel = member.voice.channel;

    // Commands that require voice channel
    const voiceCommands = ['play', 'skip', 'stop', 'pause', 'resume', 'shuffle', 'leave'];

    if (voiceCommands.includes(commandName) && !voiceChannel) {
        return interaction.reply({
            embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('❌ You need to be in a voice channel!')],
            flags: MessageFlags.Ephemeral
        });
    }

    let player = kazagumo.players.get(guild.id);

    switch (commandName) {
        case 'play': {
            const query = interaction.options.getString('query');

            await interaction.deferReply();

            try {
                // Create player if doesn't exist
                if (!player) {
                    player = await kazagumo.createPlayer({
                        guildId: guild.id,
                        textId: channel.id,
                        voiceId: voiceChannel.id,
                        volume: 80,
                        deaf: true
                    });
                }

                // Search for tracks
                const result = await kazagumo.search(query, { requester: interaction.user });

                if (!result.tracks.length) {
                    return interaction.editReply({
                        embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('❌ No results found!')]
                    });
                }

                if (result.type === 'PLAYLIST') {
                    // Add all tracks from playlist
                    for (const track of result.tracks) {
                        player.queue.add(track);
                    }

                    await interaction.editReply({
                        embeds: [new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setDescription(`📋 Added **${result.tracks.length}** tracks from playlist: **${result.playlistName}**`)]
                    });
                } else {
                    // Add single track
                    player.queue.add(result.tracks[0]);

                    if (player.playing) {
                        await interaction.editReply({
                            embeds: [new EmbedBuilder()
                                .setColor(0x00FF00)
                                .setDescription(`✅ Added to queue: **[${result.tracks[0].title}](${result.tracks[0].uri})**`)]
                        });
                    } else {
                        await interaction.editReply({
                            embeds: [new EmbedBuilder()
                                .setColor(0x00FF00)
                                .setDescription(`🎵 Starting playback...`)]
                        });
                    }
                }

                // Start playing if not already
                if (!player.playing && !player.paused) {
                    player.play();
                }
            } catch (error) {
                console.error('Play error:', error);
                await interaction.editReply({
                    embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(`❌ Error: ${error.message}`)]
                });
            }
            break;
        }

        case 'skip': {
            if (!player || !player.playing) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Nothing is playing!')],
                    flags: MessageFlags.Ephemeral
                });
            }

            player.skip();
            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(0x00FF00).setDescription('⏭️ Skipped!')]
            });
            break;
        }

        case 'stop': {
            if (!player) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Nothing is playing!')],
                    flags: MessageFlags.Ephemeral
                });
            }

            player.destroy();
            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(0x00FF00).setDescription('⏹️ Stopped and cleared the queue!')]
            });
            break;
        }

        case 'pause': {
            if (!player || !player.playing) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Nothing is playing!')],
                    flags: MessageFlags.Ephemeral
                });
            }

            player.pause(true);
            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xFFFF00).setDescription('⏸️ Paused!')]
            });
            break;
        }

        case 'resume': {
            if (!player || !player.paused) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Nothing is paused!')],
                    flags: MessageFlags.Ephemeral
                });
            }

            player.pause(false);
            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(0x00FF00).setDescription('▶️ Resumed!')]
            });
            break;
        }

        case 'queue': {
            if (!player || player.queue.length === 0) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xFFFF00).setDescription('📭 Queue is empty!')],
                    flags: MessageFlags.Ephemeral
                });
            }

            const current = player.queue.current;
            const tracks = player.queue.slice(0, 10);

            let description = `**Now Playing:**\n[${current.title}](${current.uri}) - ${formatDuration(current.length)}\n\n`;

            if (tracks.length > 0) {
                description += '**Up Next:**\n';
                tracks.forEach((track, index) => {
                    description += `${index + 1}. [${track.title}](${track.uri}) - ${formatDuration(track.length)}\n`;
                });
            }

            if (player.queue.length > 10) {
                description += `\n...and ${player.queue.length - 10} more tracks`;
            }

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('📋 Queue')
                    .setDescription(description)
                    .setFooter({ text: `Total: ${player.queue.length + 1} tracks` })]
            });
            break;
        }

        case 'nowplaying': {
            if (!player || !player.queue.current) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Nothing is playing!')],
                    flags: MessageFlags.Ephemeral
                });
            }

            const track = player.queue.current;
            const position = player.position;
            const duration = track.length;
            const progress = Math.floor((position / duration) * 20);
            const progressBar = '▬'.repeat(progress) + '🔘' + '▬'.repeat(20 - progress);

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('🎵 Now Playing')
                    .setDescription(`**[${track.title}](${track.uri})**\n\n${progressBar}\n${formatDuration(position)} / ${formatDuration(duration)}`)
                    .setThumbnail(track.thumbnail || null)
                    .addFields(
                        { name: 'Author', value: track.author || 'Unknown', inline: true },
                        { name: 'Volume', value: `${player.volume}%`, inline: true },
                        { name: 'Loop', value: player.loop || 'Off', inline: true }
                    )]
            });
            break;
        }

        case 'volume': {
            if (!player) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Nothing is playing!')],
                    flags: MessageFlags.Ephemeral
                });
            }

            const level = interaction.options.getInteger('level');
            player.setVolume(level);

            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(0x00FF00).setDescription(`🔊 Volume set to **${level}%**`)]
            });
            break;
        }

        case 'shuffle': {
            if (!player || player.queue.length < 2) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Need at least 2 songs in queue to shuffle!')],
                    flags: MessageFlags.Ephemeral
                });
            }

            player.queue.shuffle();
            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(0x00FF00).setDescription('🔀 Queue shuffled!')]
            });
            break;
        }

        case 'loop': {
            if (!player) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Nothing is playing!')],
                    flags: MessageFlags.Ephemeral
                });
            }

            const mode = interaction.options.getString('mode');
            player.setLoop(mode);

            const modeText = mode === 'none' ? 'Off' : mode === 'track' ? 'Track' : 'Queue';
            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(0x00FF00).setDescription(`🔁 Loop mode: **${modeText}**`)]
            });
            break;
        }

        case 'join': {
            if (!voiceChannel) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('❌ You need to be in a voice channel!')],
                    flags: MessageFlags.Ephemeral
                });
            }

            try {
                // Create player if doesn't exist
                if (!player) {
                    player = await kazagumo.createPlayer({
                        guildId: guild.id,
                        textId: channel.id,
                        voiceId: voiceChannel.id,
                        volume: 80,
                        deaf: true
                    });
                }

                await interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setDescription(`✅ Joined <#${voiceChannel.id}>! I will stay here until you use \`/leave\`.`)]
                });
            } catch (error) {
                console.error('Join error:', error);
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(`❌ Failed to join: ${error.message}`)],
                    flags: MessageFlags.Ephemeral
                });
            }
            break;
        }

        case 'leave': {
            if (!player) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Not in a voice channel!')],
                    flags: MessageFlags.Ephemeral
                });
            }

            player.destroy();
            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(0x00FF00).setDescription('👋 Left the voice channel!')]
            });
            break;
        }
    }
});

// Login
client.login(process.env.DISCORD_TOKEN);
