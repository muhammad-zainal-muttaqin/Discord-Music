const { Client, GatewayIntentBits, Events, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { Shoukaku, Connectors } = require('shoukaku');
const { Kazagumo, Plugins } = require('kazagumo');
const http = require('node:http');
require('dotenv').config();

const LAVALINK_NODE_NAME = 'Lavalink';

function isSessionError(error) {
    if (!error) return false;
    const message = String(error.message || '').toLowerCase();
    const path = String(error.path || '').toLowerCase();
    return (
        (error.status === 404 && path.includes('/sessions/')) ||
        path.includes('/sessions/null/') ||
        message.includes('session not found') ||
        message.includes('session expired')
    );
}

function isAlreadyDestroyedError(error) {
    if (!error) return false;
    const message = String(error.message || '').toLowerCase();
    return message.includes('already destroyed');
}

// Global error handling to prevent crashes
process.on('unhandledRejection', error => {
    // Suppress expected transient player/session errors during reconnection
    if (isSessionError(error)) {
        console.warn(`[Shoukaku] Session expired during reconnect, ignoring: ${error.path || error.message}`);
        return;
    }
    if (isAlreadyDestroyedError(error)) {
        console.warn(`[Kazagumo] Player already destroyed, ignoring duplicate destroy.`);
        return;
    }
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
        name: LAVALINK_NODE_NAME,
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
    reconnectTries: 0,             // Disable Shoukaku auto-reconnect (we handle it manually)
    reconnectInterval: 5000,
    restTimeout: 30000,
    moveOnDisconnect: false,
    resume: false,                 // Disable session resume - always create fresh connection
    resumeTimeout: 0,
    resumeByLibrary: false,
});

// Kazagumo Events
kazagumo.shoukaku.on('error', (name, error) => {
    console.error(`❌ Lavalink Node "${name}" error:`, error);
});

// Close event is handled below with reconnect logic
kazagumo.shoukaku.on('disconnect', (name, players, moved) => {
    if (moved) {
        console.log(`🔄 Lavalink Node "${name}" players moved to another node`);
    } else {
        console.warn(`⚠️ Lavalink Node "${name}" disconnected`);
    }
});

// ACTIVE reconnection mechanism - actually reconnects when Lavalink is down
let reconnectAttempts = 0;
let isReconnecting = false;
let reconnectAttemptInProgress = false; // Mutex: prevents concurrent attemptReconnect() calls
let isStartingUp = true;               // True from boot until first 'ready' event fires
let intentionalClose = false;
let reconnectBackoff = 3000;     // Start at 3s, doubles each failure up to MAX
const MAX_RECONNECT_BACKOFF = 30000; // Cap at 30s

// Store voice channel states and QUEUE for rejoin after reconnect
const savedVoiceStates = new Map(); // guildId -> { voiceId, textId, current, queue, position }

function startHealthServer() {
    const port = Number(process.env.PORT);
    if (!Number.isFinite(port) || port <= 0) return null;

    const server = http.createServer((req, res) => {
        if (req.url === '/' || req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('ok');
            return;
        }
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
    });

    server.on('error', error => {
        console.error(`[Health] Server error: ${error.message}`);
    });

    server.listen(port, '0.0.0.0', () => {
        console.log(`[Health] Listening on 0.0.0.0:${port}`);
    });

    return server;
}

const healthServer = startHealthServer();

function getMainNode() {
    return kazagumo.shoukaku.nodes.get(LAVALINK_NODE_NAME);
}

function getNodeSessionId(node) {
    if (!node) return null;
    return node.sessionId ?? node.sessionID ?? node.session?.id ?? null;
}

function isNodeStateConnected(node) {
    const state = node?.state;
    return state === 2 || state === '2' || state === 'CONNECTED' || state === 'connected';
}

function isNodeStateConnecting(node) {
    const state = node?.state;
    return state === 1 || state === '1' || state === 'CONNECTING' || state === 'connecting';
}

function isNodeOperational() {
    const node = getMainNode();
    if (!node || !isNodeStateConnected(node)) return false;

    const sessionId = getNodeSessionId(node);
    if (sessionId == null) return true;
    if (typeof sessionId === 'string') return sessionId !== 'null';

    return true;
}

async function safePlayerAction(player, actionName, fn, options = {}) {
    const { throwOnError = true } = options;
    const guildId = player?.guildId;

    if (!player) return { ok: false, reason: 'missing-player' };

    if (!isNodeOperational()) {
        if (guildId) clearPlayerInterval(guildId);
        return { ok: false, reason: 'node-not-ready' };
    }

    try {
        const value = await fn();
        return { ok: true, value };
    } catch (error) {
        if (isSessionError(error)) {
            if (guildId) cleanupPlayerState(guildId);
            return { ok: false, reason: 'session-expired', error };
        }
        if (isAlreadyDestroyedError(error)) {
            if (guildId) cleanupPlayerState(guildId);
            return { ok: false, reason: 'already-destroyed', error };
        }

        if (throwOnError) throw error;
        console.error(`[Player] Failed ${actionName} in guild ${guildId}:`, error.message || error);
        return { ok: false, reason: 'error', error };
    }
}

async function safeDestroyPlayer(guildId, player) {
    if (!player) return { ok: false, reason: 'missing-player' };

    const currentPlayer = kazagumo.players.get(guildId);
    if (currentPlayer && currentPlayer !== player) {
        cleanupPlayerState(guildId);
        return { ok: false, reason: 'stale-player' };
    }

    if (!isNodeOperational()) {
        kazagumo.players.delete(guildId);
        cleanupPlayerState(guildId);
        return { ok: false, reason: 'node-not-ready' };
    }

    try {
        await player.destroy();
        cleanupPlayerState(guildId);
        return { ok: true };
    } catch (error) {
        if (isSessionError(error) || isAlreadyDestroyedError(error)) {
            kazagumo.players.delete(guildId);
            cleanupPlayerState(guildId);
            return { ok: false, reason: isSessionError(error) ? 'session-expired' : 'already-destroyed', error };
        }
        console.error(`[Player] Failed destroy in guild ${guildId}:`, error.message || error);
        cleanupPlayerState(guildId);
        return { ok: false, reason: 'error', error };
    }
}

// Save current voice states AND queue before disconnect
function saveVoiceStates() {
    kazagumo.players.forEach((player, guildId) => {
        if (player.voiceId) {
            // Only save if there's actually music in queue or playing
            const current = player.queue.current;
            const queue = [...player.queue]; // Extract all tracks from queue

            const guild = client.guilds.cache.get(guildId);
            savedVoiceStates.set(guildId, {
                voiceId: player.voiceId,
                textId: player.textId,
                current: current,
                queue: queue,
                position: player.position,
                volume: player.volume,
                loop: player.loop
            });
            console.log(`💾 Saved state & queue for guild ${guild?.name || guildId}: ${queue.length + (current ? 1 : 0)} tracks`);
        }
    });
}

// Rejoin voice channels and RESUME music
let resumeRetryCount = 0;
const MAX_RESUME_RETRIES = 3;

async function rejoinVoiceChannels() {
    if (savedVoiceStates.size === 0) {
        resumeRetryCount = 0;
        return;
    }

    // Wait extra time for node to be fully ready
    if (!isNodeOperational()) {
        console.log(`⏳ [Resume] Node not ready yet, waiting...`);
        if (resumeRetryCount < MAX_RESUME_RETRIES) {
            resumeRetryCount++;
            setTimeout(rejoinVoiceChannels, 3000);
            return;
        }
    }

    console.log(`🔄 [Resume] Attempt ${resumeRetryCount + 1}/${MAX_RESUME_RETRIES} for ${savedVoiceStates.size} channel(s)...`);

    for (const [guildId, state] of savedVoiceStates) {
        try {
            if (!isNodeOperational()) {
                console.log('[Resume] Node became unavailable during resume pass, retrying later...');
                break;
            }

            const guild = client.guilds.cache.get(guildId);
            if (!guild) {
                console.log(`[Resume] Guild ${guildId} not found, removing from saved states`);
                savedVoiceStates.delete(guildId);
                continue;
            }

            const voiceChannel = guild.channels.cache.get(state.voiceId);
            if (!voiceChannel) {
                console.log(`[Resume] Voice channel ${state.voiceId} not found, removing from saved states`);
                savedVoiceStates.delete(guildId);
                continue;
            }

            // Check if bot already has a working player for this guild
            const existingPlayer = kazagumo.players.get(guildId);
            if (existingPlayer) {
                console.log(`[Resume] Player already exists for ${guild.name}, skipping recreation`);
                savedVoiceStates.delete(guildId);
                continue;
            }

            console.log(`[Resume] Creating new player for ${guild.name}...`);

            // Create fresh player with retry logic
            let player;
            let playerCreated = false;
            let createAttempts = 0;
            const maxCreateAttempts = 3;

            while (!playerCreated && createAttempts < maxCreateAttempts) {
                createAttempts++;
                try {
                    player = await kazagumo.createPlayer({
                        guildId: guildId,
                        textId: state.textId,
                        voiceId: state.voiceId,
                        volume: state.volume || 30,
                        deaf: true
                    });
                    playerCreated = true;
                } catch (createError) {
                    console.error(`[Resume] Player creation attempt ${createAttempts} failed: ${createError.message}`);
                    if (createAttempts < maxCreateAttempts) {
                        await new Promise(r => setTimeout(r, 2000));
                    } else {
                        throw createError;
                    }
                }
            }

            if (!playerCreated || !player) {
                throw new Error('Failed to create player after multiple attempts');
            }

            console.log(`[Resume] Player created for ${guild.name}, restoring queue...`);

            // Restore Queue
            if (state.current) {
                player.queue.add(state.current);
                if (state.queue && state.queue.length > 0) {
                    for (const track of state.queue) {
                        player.queue.add(track);
                    }
                }

                console.log(`[Resume] Starting playback for ${guild.name}...`);
                const playResult = await safePlayerAction(player, 'resume-play', () => player.play(), { throwOnError: false });
                if (!playResult.ok) {
                    throw new Error(`Playback resume skipped (${playResult.reason})`);
                }

                // Handle seek with proper delay and error handling
                if (state.position > 5000) {
                    setTimeout(async () => {
                        try {
                            const currentPlayer = kazagumo.players.get(guildId);
                            if (currentPlayer && currentPlayer.queue.current) {
                                const seekResult = await safePlayerAction(currentPlayer, 'resume-seek', () => currentPlayer.seek(state.position), { throwOnError: false });
                                if (seekResult.ok) {
                                    console.log(`[Resume] Seeked to ${state.position}ms for ${guild.name}`);
                                }
                            }
                        } catch (e) {
                            console.log(`[Resume] Could not seek to position for guild ${guildId}: ${e.message}`);
                        }
                    }, 3000);
                }
            }

            console.log(`✅ [Resume] Success: ${guild.name}`);

            const textChannel = client.channels.cache.get(state.textId);
            if (textChannel) {
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setDescription('🔄 **Reconnected!** Musik dilanjutkan otomatis.')
                    .setTimestamp();
                textChannel.send({ embeds: [embed] }).then(msg => setTimeout(() => msg.delete().catch(() => { }), 10000)).catch(() => { });
            }

            savedVoiceStates.delete(guildId);
            resumeRetryCount = 0;

        } catch (error) {
            console.error(`❌ [Resume] Failed for guild ${guildId}:`, error.message);

            // Don't retry the same guild immediately, move to next
            continue;
        }
    }

    // If there are still guilds left in saved states (failed ones), retry
    if (savedVoiceStates.size > 0) {
        resumeRetryCount++;
        if (resumeRetryCount < MAX_RESUME_RETRIES) {
            console.log(`🔄 [Resume] Retrying failed guilds in 5s... (${resumeRetryCount}/${MAX_RESUME_RETRIES})`);
            setTimeout(rejoinVoiceChannels, 5000);
        } else {
            console.log(`❌ [Resume] Giving up after ${MAX_RESUME_RETRIES} attempts. Failed guilds: ${Array.from(savedVoiceStates.keys()).join(', ')}`);
            savedVoiceStates.clear();
            resumeRetryCount = 0;
        }
    } else {
        resumeRetryCount = 0;
    }
}

// MAIN Reconnect function
async function attemptReconnect() {
    if (reconnectAttemptInProgress) return;

    // Safety check: Don't reconnect if Discord client is not ready (missing userId)
    if (!client.user?.id) {
        return;
    }

    const node = getMainNode();

    // Check node states: 0=DISCONNECTED, 1=CONNECTING, 2=CONNECTED, 3=DISCONNECTING
    if (isNodeOperational()) {
        return;
    }

    if (node) {
        // If node is connecting, wait
        if (isNodeStateConnecting(node)) {
            return;
        }

        // Node exists but is disconnected or disconnecting, need to remove it first
        console.log(`🔄 [Reconnect] Node exists but state=${node.state}, removing...`);
    }

    // Truly no node or disconnected? Start reconnecting
    reconnectAttemptInProgress = true; // Acquire mutex
    isReconnecting = true;             // User-facing: bot is in reconnect state
    reconnectAttempts++;

    // Save states if this is the first failure
    if (reconnectAttempts === 1) saveVoiceStates();

    console.log(`🔄 [Reconnect] Attempt ${reconnectAttempts} - No working nodes found. Force-adding node...`);

    try {
        // Remove existing node if any
        if (node) {
            intentionalClose = true;
            try {
                kazagumo.shoukaku.removeNode(LAVALINK_NODE_NAME);
                console.log(`🗑️ [Reconnect] Removed existing node`);
            } catch (e) {
                // Ignore errors during removal
            }
            await new Promise(r => setTimeout(r, 2000));
            intentionalClose = false;
        }

        // Also destroy any existing players since they're definitely broken
        if (kazagumo.players.size > 0) {
            console.log(`🗑️ [Reconnect] Cleaning up ${kazagumo.players.size} stale player(s)`);
            for (const [guildId] of kazagumo.players) {
                try {
                    cleanupPlayerState(guildId);
                    // Just delete from map, don't call Lavalink API
                    kazagumo.players.delete(guildId);
                } catch (e) {
                    // Ignore
                }
            }
        }

        // Add new node
        kazagumo.shoukaku.addNode({
            name: LAVALINK_NODE_NAME,
            url: process.env.LAVALINK_HOST || 'localhost:2333',
            auth: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
            secure: process.env.LAVALINK_SECURE === 'true' || false
        });
        console.log(`➕ Node added. Waiting for connection event...`);
    } catch (error) {
        console.error(`❌ Reconnect error:`, error.message);
    } finally {
        // Allow next attempt after 10 seconds if still not connected
        setTimeout(() => { reconnectAttemptInProgress = false; }, 10000);
    }
}

// Global Reconnect Interval - check every 20 seconds
setInterval(() => {
    if (!isNodeOperational()) {
        // No node or disconnected, attempt reconnect
        attemptReconnect();
    }
}, 20000);

// Kazagumo Events
kazagumo.shoukaku.on('ready', (name) => {
    console.log(`✅ Lavalink Node "${name}" connected!`);
    isReconnecting = false;
    reconnectAttemptInProgress = false; // Clear mutex in case ready fires mid-attempt
    isStartingUp = false;               // Startup window is over
    reconnectBackoff = 3000; // Reset backoff on successful connection

    // Always reset reconnect attempts on successful connection
    if (reconnectAttempts > 0) {
        console.log(`✅ [Reconnect] Success after ${reconnectAttempts} attempts.`);
        reconnectAttempts = 0;
    }

    // Wait for node to be fully ready before resuming
    setTimeout(() => {
        if (savedVoiceStates.size === 0) {
            return;
        }
        if (isNodeOperational()) {
            rejoinVoiceChannels();
        } else {
            console.log(`[Reconnect] Node not ready for resume, skipping...`);
        }
    }, 5000);
});

kazagumo.shoukaku.on('close', (name, code, reason) => {
    console.warn(`⚠️ Lavalink Node "${name}" closed: ${code} - ${reason}`);

    // 1000 = normal closure, intentional
    if (intentionalClose || code === 1000) {
        console.log(`[Reconnect] Intentional close, not attempting reconnect`);
        return;
    }

    isReconnecting = true;

    // Stop all player intervals IMMEDIATELY to prevent session/null REST errors
    for (const [guildId] of kazagumo.players) {
        clearPlayerInterval(guildId);
    }

    // Save states immediately when connection closes
    saveVoiceStates();

    // Trigger reconnect with exponential backoff
    console.log(`🔄 [Reconnect] Will attempt reconnect in ${reconnectBackoff / 1000}s...`);
    setTimeout(attemptReconnect, reconnectBackoff);

    // Double the backoff for next time (capped at max)
    reconnectBackoff = Math.min(reconnectBackoff * 2, MAX_RECONNECT_BACKOFF);
});

// Store player messages to update/delete them later
const playerMessages = new Map();
// Store update intervals for each guild
const playerIntervals = new Map();
// Track empty-queue notices to prevent spam
const emptyQueueNotifiedAt = new Map();
// Suppress empty-queue notices for intentional stops
const suppressEmptyNoticeUntil = new Map();

const EMPTY_NOTICE_COOLDOWN_MS = 30000;
const SUPPRESS_EMPTY_NOTICE_MS = 15000;

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
                        .setLabel('Seek to position')
                        .setDescription('Jump to a specific time in the track')
                        .setValue('feature_seek')
                        .setEmoji('📍'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Now Playing Info')
                        .setDescription('Get detailed track information')
                        .setValue('feature_nowplaying')
                        .setEmoji('🎵'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Clear Queue')
                        .setDescription('Remove all tracks from the queue')
                        .setValue('feature_clear')
                        .setEmoji('🗑️'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Restart Track')
                        .setDescription('Play the current track from the beginning')
                        .setValue('feature_restart')
                        .setEmoji('🔄'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Player Stats')
                        .setDescription('View player statistics and settings')
                        .setValue('feature_stats')
                        .setEmoji('📊')
                )
        );

    return [controlButtons, volumeButtons, trackDropdown, featuresDropdown];
}

// Function to update the player message
async function updatePlayerMessage(player) {
    if (!player || !player.guildId || !player.queue) return;

    const playerMsg = playerMessages.get(player.guildId);
    const track = player.queue.current;

    if (!playerMsg || !track) return;
    if (!isNodeOperational()) {
        clearPlayerInterval(player.guildId);
        return;
    }

    try {
        const embed = buildPlayerEmbed(player, track);
        const components = buildPlayerComponents(player);

        await playerMsg.edit({ embeds: [embed], components });
    } catch (error) {
        // Check if it's a session error - don't log as it's expected during reconnection
        if (isSessionError(error)) {
            // Session expired, clear interval to prevent further errors
            cleanupPlayerState(player.guildId);
            return;
        }
        // Message might have been deleted, clear the interval
        console.error('Failed to update player message:', error.message);
        clearPlayerInterval(player.guildId);
    }
}

// Function to start the update interval
function startPlayerInterval(player) {
    if (!player || !player.guildId) return;

    // Clear any existing interval
    clearPlayerInterval(player.guildId);

    // Update every 10 seconds
    const interval = setInterval(() => {
        if (!isNodeOperational()) {
            clearPlayerInterval(player.guildId);
            return;
        }
        if (player && player.queue.current && !player.paused) {
            updatePlayerMessage(player).catch(() => {
                // Errors are already logged in updatePlayerMessage
            });
        }
    }, 10000);

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

function clearPlayerMessage(guildId) {
    const playerMsg = playerMessages.get(guildId);
    if (playerMsg) {
        playerMsg.delete().catch(() => { });
        playerMessages.delete(guildId);
    }
}

function cleanupPlayerState(guildId) {
    clearPlayerInterval(guildId);
    clearPlayerMessage(guildId);
}

function markSuppressEmptyNotice(guildId) {
    suppressEmptyNoticeUntil.set(guildId, Date.now() + SUPPRESS_EMPTY_NOTICE_MS);
}

function canSendEmptyNotice(guildId) {
    const now = Date.now();
    const suppressUntil = suppressEmptyNoticeUntil.get(guildId) || 0;
    if (now < suppressUntil) return false;
    if (suppressUntil > 0) suppressEmptyNoticeUntil.delete(guildId);

    const lastNotified = emptyQueueNotifiedAt.get(guildId) || 0;
    if (now - lastNotified < EMPTY_NOTICE_COOLDOWN_MS) return false;

    emptyQueueNotifiedAt.set(guildId, now);
    return true;
}

async function stopPlaybackKeepVoice(player) {
    if (!player) return;
    player.queue.clear();

    if (typeof player.stop === 'function') {
        await safePlayerAction(player, 'stop', () => player.stop(), { throwOnError: false });
        return;
    }

    if (player.playing || player.queue.current) {
        await safePlayerAction(player, 'skip', () => player.skip(), { throwOnError: false });
    }
}

// Helper function to send a reply that auto-deletes after 5 seconds
async function sendAutoDeleteReply(interaction, embed) {
    try {
        await interaction.reply({ embeds: [embed] });
        setTimeout(() => {
            interaction.deleteReply().catch(() => { });
        }, 5000);
    } catch (error) {
        console.error('Failed to send reply:', error.message);
    }
}

// Player Events
kazagumo.on('playerStart', async (player, track) => {
    // Guard: Skip if track is null/undefined (can happen during Lavalink reconnection)
    if (!track) {
        console.warn(`⚠️ playerStart event received with null track for guild ${player.guildId}`);
        return;
    }
    
    // Immediately clear any existing interval
    clearPlayerInterval(player.guildId);
    emptyQueueNotifiedAt.delete(player.guildId);
    suppressEmptyNoticeUntil.delete(player.guildId);

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

        // 2. Build the player panel
        const playerEmbed = buildPlayerEmbed(player, track);
        const components = buildPlayerComponents(player);

        // 3. Check if player message already exists - EDIT it instead of recreating
        const existingPlayerMsg = playerMessages.get(player.guildId);

        if (existingPlayerMsg) {
            // Edit existing message for instant update (no delete/recreate delay)
            try {
                await existingPlayerMsg.edit({
                    embeds: [playerEmbed],
                    components
                });
                // Start the real-time update interval
                startPlayerInterval(player);
            } catch (error) {
                // Message might have been deleted, create a new one
                console.error('Failed to edit player message, creating new one:', error.message);
                try {
                    const playerMsg = await channel.send({
                        embeds: [playerEmbed],
                        components
                    });
                    playerMessages.set(player.guildId, playerMsg);
                    startPlayerInterval(player);
                } catch (sendError) {
                    console.error('Failed to send player message:', sendError);
                }
            }
        } else {
            // No existing message, create new one
            try {
                const playerMsg = await channel.send({
                    embeds: [playerEmbed],
                    components
                });
                playerMessages.set(player.guildId, playerMsg);
                startPlayerInterval(player);
            } catch (error) {
                console.error('Failed to send player message:', error);
            }
        }
    }
});

kazagumo.on('playerEnd', (player) => {
    // Clear the update interval when track ends
    clearPlayerInterval(player.guildId);
});

kazagumo.on('playerEmpty', (player) => {
    cleanupPlayerState(player.guildId);

    if (!canSendEmptyNotice(player.guildId)) {
        return;
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
    cleanupPlayerState(player.guildId);
    emptyQueueNotifiedAt.delete(player.guildId);
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
        return sendAutoDeleteReply(interaction,
            new EmbedBuilder().setColor(0xFF0000).setDescription('❌ You need to be in a voice channel!')
        );
    }

    let player = kazagumo.players.get(guild.id);

    switch (commandName) {
        case 'play': {
            const query = interaction.options.getString('query');

            await interaction.deferReply();

            try {
                if (!isNodeOperational()) {
                    const node = getMainNode();
                    console.warn(`[Play] Node not operational (state=${node?.state ?? 'none'}, session=${getNodeSessionId(node) ?? 'none'}, reconnecting=${isReconnecting}, starting=${isStartingUp})`);

                    let statusMessage;
                    if (isStartingUp) {
                        statusMessage = 'The music service is still starting up. Please try `/play` again in a few seconds.';
                    } else if (isReconnecting) {
                        statusMessage = 'Lavalink lost connection and is reconnecting. Please try `/play` again in a few seconds.';
                    } else {
                        statusMessage = 'The music service is temporarily unavailable. Please try `/play` again shortly.';
                    }

                    await interaction.editReply({
                        embeds: [new EmbedBuilder().setColor(0xFFFF00).setDescription(statusMessage)]
                    });
                    setTimeout(() => {
                        interaction.deleteReply().catch(() => { });
                    }, 5000);
                    return;
                }

                // Create player if doesn't exist
                if (!player) {
                    player = await kazagumo.createPlayer({
                        guildId: guild.id,
                        textId: channel.id,
                        voiceId: voiceChannel.id,
                        volume: 30,
                        deaf: true
                    });
                }

                // Search for tracks
                const result = await kazagumo.search(query, { requester: interaction.user });

                if (!result.tracks.length) {
                    await interaction.editReply({
                        embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('❌ No results found!')]
                    });
                    // Auto-delete after 5 seconds
                    setTimeout(() => {
                        interaction.deleteReply().catch(() => { });
                    }, 5000);
                    return;
                }

                if (result.type === 'PLAYLIST') {
                    // Add all tracks from playlist
                    for (const track of result.tracks) {
                        player.queue.add(track);
                    }

                    const reply = await interaction.editReply({
                        embeds: [new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setDescription(`📋 Added **${result.tracks.length}** tracks from playlist: **${result.playlistName}**`)]
                    });

                    // Auto-delete after 5 seconds
                    setTimeout(() => {
                        interaction.deleteReply().catch(() => { });
                    }, 5000);

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

                        // Auto-delete after 5 seconds
                        setTimeout(() => {
                            interaction.deleteReply().catch(() => { });
                        }, 5000);

                        // Update the player message with new queue count
                        updatePlayerMessage(player);
                    } else {
                        await interaction.editReply({
                            embeds: [new EmbedBuilder()
                                .setColor(0x00FF00)
                                .setDescription(`🎵 Starting playback...`)]
                        });

                        // Auto-delete after 5 seconds
                        setTimeout(() => {
                            interaction.deleteReply().catch(() => { });
                        }, 5000);
                    }
                }

                // Start playing if not already
                if (!player.playing && !player.paused) {
                    const playResult = await safePlayerAction(player, 'play', () => player.play(), { throwOnError: false });
                    if (!playResult.ok) {
                        console.warn(`[Play] Playback deferred for guild ${guild.id}: ${playResult.reason}`);
                    }
                }
            } catch (error) {
                console.error('Play error:', error);
                await interaction.editReply({
                    embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(`❌ Error: ${error.message}`)]
                });
                // Auto-delete after 5 seconds
                setTimeout(() => {
                    interaction.deleteReply().catch(() => { });
                }, 5000);
            }
            break;
        }

        case 'skip': {
            if (!player || !player.playing) {
                return sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Nothing is playing!')
                );
            }

            try {
                await safePlayerAction(player, 'skip', () => player.skip(), { throwOnError: false });
                await sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0x00FF00).setDescription('⏭️ Skipped!')
                );
            } catch (e) {
                await sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Failed to skip. Please try again.')
                );
            }
            break;
        }

        case 'stop': {
            if (!player) {
                return sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Nothing is playing!')
                );
            }

            markSuppressEmptyNotice(guild.id);
            cleanupPlayerState(guild.id);
            await stopPlaybackKeepVoice(player);
            await sendAutoDeleteReply(interaction,
                new EmbedBuilder().setColor(0x00FF00).setDescription('⏹️ Stopped and cleared the queue!')
            );
            break;
        }

        case 'pause': {
            if (!player || !player.playing) {
                return sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Nothing is playing!')
                );
            }

            try {
                await safePlayerAction(player, 'pause', () => player.pause(true), { throwOnError: false });
            } catch (e) {
                return sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Failed to pause. Please try again.')
                );
            }
            clearPlayerInterval(player.guildId);
            await sendAutoDeleteReply(interaction,
                new EmbedBuilder().setColor(0xFFFF00).setDescription('⏸️ Paused!')
            );
            updatePlayerMessage(player);
            break;
        }

        case 'resume': {
            if (!player || !player.paused) {
                return sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Nothing is paused!')
                );
            }

            try {
                await safePlayerAction(player, 'resume', () => player.pause(false), { throwOnError: false });
            } catch (e) {
                return sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Failed to resume. Please try again.')
                );
            }
            startPlayerInterval(player);
            await sendAutoDeleteReply(interaction,
                new EmbedBuilder().setColor(0x00FF00).setDescription('▶️ Resumed!')
            );
            updatePlayerMessage(player);
            break;
        }

        case 'queue': {
            if (!player || player.queue.length === 0) {
                return sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0xFFFF00).setDescription('📭 Queue is empty!')
                );
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

            await sendAutoDeleteReply(interaction,
                new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('📋 Queue')
                    .setDescription(description)
                    .setFooter({ text: `Total: ${player.queue.length + 1} tracks` })
            );
            break;
        }

        case 'nowplaying': {
            if (!player || !player.queue.current) {
                return sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Nothing is playing!')
                );
            }

            const track = player.queue.current;
            const position = player.position;
            const duration = track.length;
            const progress = Math.floor((position / duration) * 20);
            const progressBar = '▬'.repeat(progress) + '🔘' + '▬'.repeat(20 - progress);

            await sendAutoDeleteReply(interaction,
                new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('🎵 Now Playing')
                    .setDescription(`**[${track.title}](${track.uri})**\n\n${progressBar}\n${formatDuration(position)} / ${formatDuration(duration)}`)
                    .setThumbnail(track.thumbnail || null)
                    .addFields(
                        { name: 'Author', value: track.author || 'Unknown', inline: true },
                        { name: 'Volume', value: `${player.volume}%`, inline: true },
                        { name: 'Loop', value: player.loop || 'Off', inline: true }
                    )
            );
            break;
        }

        case 'volume': {
            if (!player) {
                return sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Nothing is playing!')
                );
            }

            const level = interaction.options.getInteger('level');
            try {
                player.setVolume(level);
            } catch (e) {
                return sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Failed to set volume. Please try again.')
                );
            }

            await sendAutoDeleteReply(interaction,
                new EmbedBuilder().setColor(0x00FF00).setDescription(`🔊 Volume set to **${level}%**`)
            );
            updatePlayerMessage(player);
            break;
        }

        case 'shuffle': {
            if (!player || player.queue.length < 2) {
                return sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Need at least 2 songs in queue to shuffle!')
                );
            }

            player.queue.shuffle();
            await sendAutoDeleteReply(interaction,
                new EmbedBuilder().setColor(0x00FF00).setDescription('🔀 Queue shuffled!')
            );
            updatePlayerMessage(player);
            break;
        }

        case 'loop': {
            if (!player) {
                return sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Nothing is playing!')
                );
            }

            const mode = interaction.options.getString('mode');
            player.setLoop(mode);

            const modeText = mode === 'none' ? 'Off' : mode === 'track' ? 'Track' : 'Queue';
            await sendAutoDeleteReply(interaction,
                new EmbedBuilder().setColor(0x00FF00).setDescription(`🔁 Loop mode: **${modeText}**`)
            );
            updatePlayerMessage(player);
            break;
        }

        case 'join': {
            if (!voiceChannel) {
                return sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0xFF0000).setDescription('❌ You need to be in a voice channel!')
                );
            }

            try {
                // Create player if doesn't exist
                if (!player) {
                    player = await kazagumo.createPlayer({
                        guildId: guild.id,
                        textId: channel.id,
                        voiceId: voiceChannel.id,
                        volume: 30,
                        deaf: true
                    });
                }

                await sendAutoDeleteReply(interaction,
                    new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setDescription(`✅ Joined <#${voiceChannel.id}>! I will stay here until you use \`/leave\`.`)
                );
            } catch (error) {
                console.error('Join error:', error);
                await sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0xFF0000).setDescription(`❌ Failed to join: ${error.message}`)
                );
            }
            break;
        }

        case 'leave': {
            if (!player) {
                return sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Not in a voice channel!')
                );
            }

            markSuppressEmptyNotice(guild.id);
            cleanupPlayerState(guild.id);

            await safeDestroyPlayer(guild.id, player);
            await sendAutoDeleteReply(interaction,
                new EmbedBuilder().setColor(0x00FF00).setDescription('👋 Left the voice channel!')
            );
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
        return sendAutoDeleteReply(interaction,
            new EmbedBuilder().setColor(0xFF0000).setDescription('❌ No music is playing!')
        );
    }

    // Check if user is in voice channel
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
        return sendAutoDeleteReply(interaction,
            new EmbedBuilder().setColor(0xFF0000).setDescription('❌ You need to be in a voice channel!')
        );
    }

    switch (customId) {
        case 'player_previous':
            // Go to beginning of current song (there's no previous track in Kazagumo by default)
            if (player.queue.current) {
                try {
                    await safePlayerAction(player, 'seek-to-start', () => player.seek(0), { throwOnError: false });
                    await sendAutoDeleteReply(interaction,
                        new EmbedBuilder().setColor(0x00FF00).setDescription('⏮️ Restarted current track!')
                    );
                    // Update player to show 0:00 position
                    updatePlayerMessage(player);
                } catch (e) {
                    await sendAutoDeleteReply(interaction,
                        new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Failed to restart track. Please try again.')
                    );
                }
            }
            break;

        case 'player_pause':
            try {
                if (player.paused) {
                    await safePlayerAction(player, 'resume', () => player.pause(false), { throwOnError: false });
                    // Restart the update interval when resuming
                    startPlayerInterval(player);
                    await sendAutoDeleteReply(interaction,
                        new EmbedBuilder().setColor(0x00FF00).setDescription('▶️ Resumed!')
                    );
                } else {
                    await safePlayerAction(player, 'pause', () => player.pause(true), { throwOnError: false });
                    // Stop updates while paused (saves resources)
                    clearPlayerInterval(player.guildId);
                    await sendAutoDeleteReply(interaction,
                        new EmbedBuilder().setColor(0xFFFF00).setDescription('⏸️ Paused!')
                    );
                }
                // Update player to show paused/playing state and button icon
                updatePlayerMessage(player);
            } catch (e) {
                await sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Failed to toggle pause. Please try again.')
                );
            }
            break;

        case 'player_skip':
            try {
                await safePlayerAction(player, 'skip', () => player.skip(), { throwOnError: false });
                await sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0x00FF00).setDescription('⏭️ Skipped!')
                );
            } catch (e) {
                await sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Failed to skip. Please try again.')
                );
            }
            break;

        case 'player_stop':
            markSuppressEmptyNotice(guild.id);
            cleanupPlayerState(guild.id);
            await stopPlaybackKeepVoice(player);
            await sendAutoDeleteReply(interaction,
                new EmbedBuilder().setColor(0xFF0000).setDescription('⏹️ Stopped and cleared the queue!')
            );
            break;

        case 'player_shuffle':
            if (player.queue.length < 2) {
                return sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Need at least 2 songs to shuffle!')
                );
            }
            player.queue.shuffle();
            await sendAutoDeleteReply(interaction,
                new EmbedBuilder().setColor(0x00FF00).setDescription('🔀 Queue shuffled!')
            );
            // Update player to show shuffled queue
            updatePlayerMessage(player);
            break;

        case 'player_voldown':
            try {
                const newVolDown = Math.max(0, player.volume - 10);
                player.setVolume(newVolDown);
                await sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0x00FF00).setDescription(`🔉 Volume: **${newVolDown}%**`)
                );
                // Update player to show new volume
                updatePlayerMessage(player);
            } catch (e) {
                await sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Failed to adjust volume.')
                );
            }
            break;

        case 'player_volup':
            try {
                const newVolUp = Math.min(100, player.volume + 10);
                player.setVolume(newVolUp);
                await sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0x00FF00).setDescription(`🔊 Volume: **${newVolUp}%**`)
                );
                // Update player to show new volume
                updatePlayerMessage(player);
            } catch (e) {
                await sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Failed to adjust volume.')
                );
            }
            break;

        case 'player_loop':
            try {
                const modes = ['none', 'track', 'queue'];
                const currentMode = player.loop || 'none';
                const nextMode = modes[(modes.indexOf(currentMode) + 1) % modes.length];
                player.setLoop(nextMode);
                const modeEmoji = nextMode === 'none' ? '➡️ Off' : nextMode === 'track' ? '🔂 Track' : '🔁 Queue';
                await sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0x00FF00).setDescription(`Loop: **${modeEmoji}**`)
                );
                // Update player to show loop button color change
                updatePlayerMessage(player);
            } catch (e) {
                await sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0xFF0000).setDescription('❌ Failed to set loop mode.')
                );
            }
            break;

        case 'player_queue':
            if (player.queue.length === 0) {
                return sendAutoDeleteReply(interaction,
                    new EmbedBuilder().setColor(0xFFFF00).setDescription('📭 Queue is empty!')
                );
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

            await sendAutoDeleteReply(interaction,
                new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('📋 Queue')
                    .setDescription(description)
            );
            break;

        case 'player_favorite':
            // Show a nice message (you could implement actual favorites storage later)
            const favTrack = player.queue.current;
            if (favTrack) {
                await sendAutoDeleteReply(interaction,
                    new EmbedBuilder()
                        .setColor(0xFF69B4)
                        .setDescription(`❤️ **${favTrack.title}** added to your favorites!`)
                        .setFooter({ text: 'Tip: This is a placeholder - implement storage for persistent favorites!' })
                );
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
        return sendAutoDeleteReply(interaction,
            new EmbedBuilder().setColor(0xFF0000).setDescription('❌ No music is playing!')
        );
    }

    // Handle Track Selection
    if (customId === 'player_tracks') {
        if (selectedValue === 'no_tracks') {
            return sendAutoDeleteReply(interaction,
                new EmbedBuilder().setColor(0xFFFF00).setDescription('📭 No tracks in queue! Use `/play` to add songs.')
            );
        }

        const trackIndex = parseInt(selectedValue.replace('track_', ''));
        const selectedTrack = player.queue[trackIndex];

        if (selectedTrack) {
            await sendAutoDeleteReply(interaction,
                new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle(`📀 Track #${trackIndex + 1}`)
                    .setDescription(`**[${selectedTrack.title}](${selectedTrack.uri})**`)
                    .addFields(
                        { name: 'Author', value: selectedTrack.author || 'Unknown', inline: true },
                        { name: 'Duration', value: formatDuration(selectedTrack.length), inline: true },
                        { name: 'Requested by', value: selectedTrack.requester?.tag || 'Unknown', inline: true }
                    )
                    .setThumbnail(selectedTrack.thumbnail || null)
            );
        }
        return;
    }

    // Handle More Features
    if (customId === 'player_features') {
        switch (selectedValue) {
            case 'feature_seek':
                await sendAutoDeleteReply(interaction,
                    new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle('📍 Seek to Position')
                        .setDescription('Use the `/seek` command to jump to a specific time!\n\n**Examples:**\n• `/seek 1:30` - Jump to 1 minute 30 seconds\n• `/seek 0:45` - Jump to 45 seconds')
                        .setFooter({ text: 'Note: Seek command needs to be implemented separately' })
                );
                break;

            case 'feature_nowplaying':
                const track = player.queue.current;
                if (track) {
                    const position = player.position;
                    const duration = track.length;
                    const progressBar = createProgressBar(position, duration, 20);

                    await sendAutoDeleteReply(interaction,
                        new EmbedBuilder()
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
                            .setImage(track.thumbnail || null)
                    );
                }
                break;

            case 'feature_clear':
                const queueLength = player.queue.length;
                player.queue.clear();
                await sendAutoDeleteReply(interaction,
                    new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setDescription(`🗑️ Cleared **${queueLength}** tracks from the queue!`)
                );
                // Update player message
                updatePlayerMessage(player);
                break;

            case 'feature_restart':
                try {
                    await safePlayerAction(player, 'seek-to-start', () => player.seek(0), { throwOnError: false });
                    await sendAutoDeleteReply(interaction,
                        new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setDescription('🔄 Restarted the current track!')
                    );
                    // Update player message
                    updatePlayerMessage(player);
                } catch (e) {
                    await sendAutoDeleteReply(interaction,
                        new EmbedBuilder()
                            .setColor(0xFF0000)
                            .setDescription('❌ Failed to restart track.')
                    );
                }
                break;

            case 'feature_stats':
                const statsTrack = player.queue.current;
                const totalQueueDuration = player.queue.reduce((acc, t) => acc + t.length, 0);

                await sendAutoDeleteReply(interaction,
                    new EmbedBuilder()
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
                        .setFooter({ text: `Guild ID: ${player.guildId}` })
                );
                break;
        }
    }
});

// Login
client.login(process.env.DISCORD_TOKEN);
