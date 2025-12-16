const { Client, GatewayIntentBits, Events, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
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

// Graceful shutdown handling (for Railway redeploy)
process.on('SIGTERM', () => {
    console.log('📴 Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('📴 Received SIGINT, shutting down gracefully...');
    process.exit(0);
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

// Store player messages to update/delete them later
const playerMessages = new Map();
// Store update intervals for each guild
const playerIntervals = new Map();

// Helper function to create progress bar
function createProgressBar(current, total, length = 12) {
    if (total === 0) return '🔘' + '▬'.repeat(length - 1);
    const progress = Math.round((current / total) * length);
    const empty = length - progress;
    const progressBar = '▬'.repeat(Math.max(0, progress)) + '🔘' + '▬'.repeat(Math.max(0, empty - 1));
    return progressBar;
}

// Helper function to build player embed
function buildPlayerEmbed(player, track) {
    const position = player.position || 0;
    const progressBar = createProgressBar(position, track.length);

    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({ name: '🎧 Music Player', iconURL: track.requester?.displayAvatarURL?.() || null })
        .setTitle(track.title)
        .setURL(track.uri)
        .setDescription(
            `**Author:** ${track.author || 'Unknown'}\n` +
            `**Requested by:** ${track.requester?.tag || 'Unknown'}\n\n` +
            `${progressBar}\n` +
            `\`${formatDuration(position)}\` / \`${formatDuration(track.length)}\``
        )
        .setThumbnail(track.thumbnail || null)
        .setFooter({ text: `🎶 Queue: ${player.queue.length} tracks remaining • Volume: ${player.volume}% • ${player.paused ? '⏸️ Paused' : '▶️ Playing'}` });
}

// Helper function to build player components
function buildPlayerComponents(player) {
    // Row 1: Main playback controls
    const controlButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('player_previous')
                .setEmoji('⏮️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('player_pause')
                .setEmoji(player.paused ? '▶️' : '⏸️')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('player_skip')
                .setEmoji('⏭️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('player_stop')
                .setEmoji('⏹️')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('player_shuffle')
                .setEmoji('🔀')
                .setStyle(ButtonStyle.Secondary)
        );

    // Row 2: Volume and loop controls
    const volumeButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('player_voldown')
                .setEmoji('🔉')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('player_volup')
                .setEmoji('🔊')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('player_loop')
                .setEmoji('🔁')
                .setStyle(player.loop && player.loop !== 'none' ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('player_favorite')
                .setEmoji('❤️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('player_queue')
                .setEmoji('📋')
                .setStyle(ButtonStyle.Secondary)
        );

    // Row 3: Track selection dropdown (shows queue)
    const trackDropdown = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('player_tracks')
                .setPlaceholder(`📀 View Queue Tracks (${player.queue.length})`)
                .addOptions(
                    player.queue.length > 0
                        ? player.queue.slice(0, 25).map((t, i) =>
                            new StringSelectMenuOptionBuilder()
                                .setLabel(`${i + 1}. ${t.title.substring(0, 90)}`)
                                .setDescription(`${t.author || 'Unknown'} • ${formatDuration(t.length)}`)
                                .setValue(`track_${i}`)
                        )
                        : [new StringSelectMenuOptionBuilder()
                            .setLabel('No tracks in queue')
                            .setDescription('Use /play to add more songs!')
                            .setValue('no_tracks')]
                )
        );

    // Row 4: More Features dropdown
    const featuresDropdown = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('player_features')
                .setPlaceholder('⚡ More Features...')
                .addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel('📍 Seek to position')
                        .setDescription('Jump to a specific time in the track')
                        .setValue('feature_seek')
                        .setEmoji('📍'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('🎵 Now Playing Info')
                        .setDescription('Get detailed track information')
                        .setValue('feature_nowplaying')
                        .setEmoji('🎵'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('🗑️ Clear Queue')
                        .setDescription('Remove all tracks from the queue')
                        .setValue('feature_clear')
                        .setEmoji('🗑️'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('🔄 Restart Track')
                        .setDescription('Play the current track from the beginning')
                        .setValue('feature_restart')
                        .setEmoji('🔄'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('📊 Player Stats')
                        .setDescription('View player statistics and settings')
                        .setValue('feature_stats')
                        .setEmoji('📊')
                )
        );

    return [controlButtons, volumeButtons, trackDropdown, featuresDropdown];
}

// Function to update the player message
async function updatePlayerMessage(player) {
    const playerMsg = playerMessages.get(player.guildId);
    const track = player.queue.current;

    if (!playerMsg || !track) return;

    try {
        const embed = buildPlayerEmbed(player, track);
        const components = buildPlayerComponents(player);

        await playerMsg.edit({ embeds: [embed], components });
    } catch (error) {
        // Message might have been deleted, clear the interval
        console.error('Failed to update player message:', error.message);
        clearPlayerInterval(player.guildId);
    }
}

// Function to start the update interval
function startPlayerInterval(player) {
    // Clear any existing interval
    clearPlayerInterval(player.guildId);

    // Update every 5 seconds
    const interval = setInterval(() => {
        if (player && player.queue.current && !player.paused) {
            updatePlayerMessage(player);
        }
    }, 5000);

    playerIntervals.set(player.guildId, interval);
}

// Function to clear the update interval
function clearPlayerInterval(guildId) {
    const interval = playerIntervals.get(guildId);
    if (interval) {
        clearInterval(interval);
        playerIntervals.delete(guildId);
    }
}

// Player Events
kazagumo.on('playerStart', async (player, track) => {
    const channel = client.channels.cache.get(player.textId);
    if (channel) {
        // 1. Send brief "Now Playing" notification (auto-deletes after 5 seconds)
        const notificationEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🎵 Now Playing')
            .setDescription(`**[${track.title}](${track.uri})**`)
            .setThumbnail(track.thumbnail || null);

        channel.send({ embeds: [notificationEmbed] })
            .then(msg => {
                setTimeout(() => {
                    msg.delete().catch(() => { });
                }, 5000);
            })
            .catch(console.error);

        // 2. Delete previous player message if exists
        const oldPlayerMsg = playerMessages.get(player.guildId);
        if (oldPlayerMsg) {
            oldPlayerMsg.delete().catch(() => { });
        }

        // 3. Build and send the player panel
        const playerEmbed = buildPlayerEmbed(player, track);
        const components = buildPlayerComponents(player);

        try {
            const playerMsg = await channel.send({
                embeds: [playerEmbed],
                components
            });
            playerMessages.set(player.guildId, playerMsg);

            // 4. Start the real-time update interval (every 5 seconds)
            startPlayerInterval(player);
        } catch (error) {
            console.error('Failed to send player message:', error);
        }
    }
});

kazagumo.on('playerEnd', (player) => {
    // Clear the update interval when track ends
    clearPlayerInterval(player.guildId);
});

kazagumo.on('playerEmpty', (player) => {
    // Clear the update interval
    clearPlayerInterval(player.guildId);

    // Delete the player message
    const playerMsg = playerMessages.get(player.guildId);
    if (playerMsg) {
        playerMsg.delete().catch(() => { });
        playerMessages.delete(player.guildId);
    }

    const channel = client.channels.cache.get(player.textId);
    if (channel) {
        const embed = new EmbedBuilder()
            .setColor(0xFFFF00)
            .setDescription('📭 Queue is empty! Add more songs to continue listening.')
            .setTimestamp();

        channel.send({ embeds: [embed] })
            .then(msg => {
                // Auto-delete after 5 seconds
                setTimeout(() => {
                    msg.delete().catch(() => { });
                }, 5000);
            })
            .catch(console.error);
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

                    // Update the player message with new queue count
                    if (player.playing) {
                        updatePlayerMessage(player);
                    }
                } else {
                    // Add single track
                    player.queue.add(result.tracks[0]);

                    if (player.playing) {
                        await interaction.editReply({
                            embeds: [new EmbedBuilder()
                                .setColor(0x00FF00)
                                .setDescription(`✅ Added to queue: **[${result.tracks[0].title}](${result.tracks[0].uri})**`)]
                        });

                        // Update the player message with new queue count
                        updatePlayerMessage(player);
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

// Handle Button Interactions (Player Controls)
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    const { customId, guild, member } = interaction;

    // Only handle player buttons
    if (!customId.startsWith('player_')) return;

    const player = kazagumo.players.get(guild.id);

    if (!player) {
        return interaction.reply({
            embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('❌ No music is playing!')],
            flags: MessageFlags.Ephemeral
        });
    }

    // Check if user is in voice channel
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
        return interaction.reply({
            embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('❌ You need to be in a voice channel!')],
            flags: MessageFlags.Ephemeral
        });
    }

    switch (customId) {
        case 'player_previous':
            // Go to beginning of current song (there's no previous track in Kazagumo by default)
            if (player.queue.current) {
                player.seek(0);
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0x00FF00).setDescription('⏮️ Restarted current track!')],
                    flags: MessageFlags.Ephemeral
                });
                // Update player to show 0:00 position
                updatePlayerMessage(player);
            }
            break;

        case 'player_pause':
            if (player.paused) {
                player.pause(false);
                // Restart the update interval when resuming
                startPlayerInterval(player);
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0x00FF00).setDescription('▶️ Resumed!')],
                    flags: MessageFlags.Ephemeral
                });
            } else {
                player.pause(true);
                // Stop updates while paused (saves resources)
                clearPlayerInterval(player.guildId);
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xFFFF00).setDescription('⏸️ Paused!')],
                    flags: MessageFlags.Ephemeral
                });
            }
            // Update player to show paused/playing state and button icon
            updatePlayerMessage(player);
            break;

        case 'player_skip':
            player.skip();
            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(0x00FF00).setDescription('⏭️ Skipped!')],
                flags: MessageFlags.Ephemeral
            });
            break;

        case 'player_stop':
            // Clear the update interval
            clearPlayerInterval(guild.id);
            // Delete player message
            const playerMsg = playerMessages.get(guild.id);
            if (playerMsg) {
                playerMsg.delete().catch(() => { });
                playerMessages.delete(guild.id);
            }
            player.destroy();
            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('⏹️ Stopped and left the channel!')],
                flags: MessageFlags.Ephemeral
            });
            break;

        case 'player_shuffle':
            if (player.queue.length < 2) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Need at least 2 songs to shuffle!')],
                    flags: MessageFlags.Ephemeral
                });
            }
            player.queue.shuffle();
            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(0x00FF00).setDescription('🔀 Queue shuffled!')],
                flags: MessageFlags.Ephemeral
            });
            // Update player to show shuffled queue
            updatePlayerMessage(player);
            break;

        case 'player_voldown':
            const newVolDown = Math.max(0, player.volume - 10);
            player.setVolume(newVolDown);
            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(0x00FF00).setDescription(`🔉 Volume: **${newVolDown}%**`)],
                flags: MessageFlags.Ephemeral
            });
            // Update player to show new volume
            updatePlayerMessage(player);
            break;

        case 'player_volup':
            const newVolUp = Math.min(100, player.volume + 10);
            player.setVolume(newVolUp);
            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(0x00FF00).setDescription(`🔊 Volume: **${newVolUp}%**`)],
                flags: MessageFlags.Ephemeral
            });
            // Update player to show new volume
            updatePlayerMessage(player);
            break;

        case 'player_loop':
            const modes = ['none', 'track', 'queue'];
            const currentMode = player.loop || 'none';
            const nextMode = modes[(modes.indexOf(currentMode) + 1) % modes.length];
            player.setLoop(nextMode);
            const modeEmoji = nextMode === 'none' ? '➡️ Off' : nextMode === 'track' ? '🔂 Track' : '🔁 Queue';
            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(0x00FF00).setDescription(`Loop: **${modeEmoji}**`)],
                flags: MessageFlags.Ephemeral
            });
            // Update player to show loop button color change
            updatePlayerMessage(player);
            break;

        case 'player_queue':
            if (player.queue.length === 0) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xFFFF00).setDescription('📭 Queue is empty!')],
                    flags: MessageFlags.Ephemeral
                });
            }

            const current = player.queue.current;
            const tracks = player.queue.slice(0, 5);

            let description = `**Now Playing:**\n[${current.title}](${current.uri})\n\n`;

            if (tracks.length > 0) {
                description += '**Up Next:**\n';
                tracks.forEach((track, index) => {
                    description += `${index + 1}. ${track.title}\n`;
                });
            }

            if (player.queue.length > 5) {
                description += `\n...and ${player.queue.length - 5} more`;
            }

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('📋 Queue')
                    .setDescription(description)],
                flags: MessageFlags.Ephemeral
            });
            break;

        case 'player_favorite':
            // Show a nice message (you could implement actual favorites storage later)
            const favTrack = player.queue.current;
            if (favTrack) {
                await interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setColor(0xFF69B4)
                        .setDescription(`❤️ **${favTrack.title}** added to your favorites!`)
                        .setFooter({ text: 'Tip: This is a placeholder - implement storage for persistent favorites!' })],
                    flags: MessageFlags.Ephemeral
                });
            }
            break;
    }
});

// Handle Select Menu Interactions (Dropdowns)
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isStringSelectMenu()) return;

    const { customId, guild, member, values } = interaction;
    const selectedValue = values[0];

    const player = kazagumo.players.get(guild.id);

    if (!player) {
        return interaction.reply({
            embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('❌ No music is playing!')],
            flags: MessageFlags.Ephemeral
        });
    }

    // Handle Track Selection
    if (customId === 'player_tracks') {
        if (selectedValue === 'no_tracks') {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xFFFF00).setDescription('📭 No tracks in queue! Use `/play` to add songs.')],
                flags: MessageFlags.Ephemeral
            });
        }

        const trackIndex = parseInt(selectedValue.replace('track_', ''));
        const selectedTrack = player.queue[trackIndex];

        if (selectedTrack) {
            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle(`📀 Track #${trackIndex + 1}`)
                    .setDescription(`**[${selectedTrack.title}](${selectedTrack.uri})**`)
                    .addFields(
                        { name: 'Author', value: selectedTrack.author || 'Unknown', inline: true },
                        { name: 'Duration', value: formatDuration(selectedTrack.length), inline: true },
                        { name: 'Requested by', value: selectedTrack.requester?.tag || 'Unknown', inline: true }
                    )
                    .setThumbnail(selectedTrack.thumbnail || null)],
                flags: MessageFlags.Ephemeral
            });
        }
        return;
    }

    // Handle More Features
    if (customId === 'player_features') {
        switch (selectedValue) {
            case 'feature_seek':
                await interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle('📍 Seek to Position')
                        .setDescription('Use the `/seek` command to jump to a specific time!\n\n**Examples:**\n• `/seek 1:30` - Jump to 1 minute 30 seconds\n• `/seek 0:45` - Jump to 45 seconds')
                        .setFooter({ text: 'Note: Seek command needs to be implemented separately' })],
                    flags: MessageFlags.Ephemeral
                });
                break;

            case 'feature_nowplaying':
                const track = player.queue.current;
                if (track) {
                    const position = player.position;
                    const duration = track.length;
                    const progressBar = createProgressBar(position, duration, 20);

                    await interaction.reply({
                        embeds: [new EmbedBuilder()
                            .setColor(0x5865F2)
                            .setTitle('🎵 Now Playing - Detailed Info')
                            .setDescription(`**[${track.title}](${track.uri})**\n\n${progressBar}\n\`${formatDuration(position)}\` / \`${formatDuration(duration)}\``)
                            .addFields(
                                { name: '👤 Author', value: track.author || 'Unknown', inline: true },
                                { name: '👥 Requested by', value: track.requester?.tag || 'Unknown', inline: true },
                                { name: '🔊 Volume', value: `${player.volume}%`, inline: true },
                                { name: '🔁 Loop Mode', value: player.loop || 'Off', inline: true },
                                { name: '📋 Queue Length', value: `${player.queue.length} tracks`, inline: true },
                                { name: '⏱️ Position', value: `${formatDuration(position)} / ${formatDuration(duration)}`, inline: true }
                            )
                            .setThumbnail(track.thumbnail || null)
                            .setImage(track.thumbnail || null)],
                        flags: MessageFlags.Ephemeral
                    });
                }
                break;

            case 'feature_clear':
                const queueLength = player.queue.length;
                player.queue.clear();
                await interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setDescription(`🗑️ Cleared **${queueLength}** tracks from the queue!`)],
                    flags: MessageFlags.Ephemeral
                });
                break;

            case 'feature_restart':
                player.seek(0);
                await interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setDescription('🔄 Restarted the current track!')],
                    flags: MessageFlags.Ephemeral
                });
                break;

            case 'feature_stats':
                const statsTrack = player.queue.current;
                const totalQueueDuration = player.queue.reduce((acc, t) => acc + t.length, 0);

                await interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle('📊 Player Statistics')
                        .setDescription('Current player settings and information')
                        .addFields(
                            { name: '🎵 Current Track', value: statsTrack?.title?.substring(0, 50) || 'None', inline: false },
                            { name: '🔊 Volume', value: `${player.volume}%`, inline: true },
                            { name: '🔁 Loop Mode', value: player.loop || 'Off', inline: true },
                            { name: '⏯️ Status', value: player.paused ? 'Paused' : 'Playing', inline: true },
                            { name: '📋 Queue Size', value: `${player.queue.length} tracks`, inline: true },
                            { name: '⏱️ Total Queue Duration', value: formatDuration(totalQueueDuration), inline: true },
                            { name: '🎧 Voice Channel', value: `<#${player.voiceId}>`, inline: true }
                        )
                        .setFooter({ text: `Guild ID: ${player.guildId}` })],
                    flags: MessageFlags.Ephemeral
                });
                break;
        }
    }
});

// Login
client.login(process.env.DISCORD_TOKEN);
