const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} = require('discord.js');
const { createProgressBar, formatDuration } = require('../utils');

function buildPlayerEmbed(player, track = player.queue.current) {
    if (!track) return null;

    const progressBar = createProgressBar(player.position, track.length, 20);
    const status = player.paused ? 'Paused' : 'Playing';
    const queueCount = player.queue.length;

    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎧 Music Player')
        .setDescription(
            `**[${track.title}](${track.uri})**\n\n` +
            `Author: ${track.author || 'Unknown'}\n` +
            `Requested by: ${track.requester?.tag || 'Unknown'}\n\n` +
            `${progressBar}\n` +
            `\`${formatDuration(player.position)}\` / \`${formatDuration(track.length)}\`\n\n` +
            `🎶 Queue: ${queueCount} track(s) remaining • Volume: ${player.volume}% • ${status}`
        )
        .setThumbnail(track.thumbnail || null);
}

function buildPlayerComponents(player) {
    const loopMode = player.loop || 'none';
    const queueSize = player.queue.length;
    const pauseEmoji = player.paused ? '▶️' : '⏸️';

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('player_previous').setLabel('⏮️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('player_pause').setLabel(pauseEmoji).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('player_skip').setLabel('⏭️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('player_stop').setLabel('⏹️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('player_shuffle').setLabel('🔀').setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('player_voldown').setLabel('🔉').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('player_volup').setLabel('🔊').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('player_loop')
            .setLabel('🔁')
            .setStyle(loopMode === 'none' ? ButtonStyle.Secondary : ButtonStyle.Success),
        new ButtonBuilder().setCustomId('player_queue').setLabel('📋').setStyle(ButtonStyle.Secondary)
    );

    const trackOptions = player.queue.slice(0, 25).map((track, index) =>
        new StringSelectMenuOptionBuilder()
            .setLabel(`${index + 1}. ${track.title}`.slice(0, 100))
            .setDescription(`${formatDuration(track.length)} • ${track.author || 'Unknown'}`.slice(0, 100))
            .setValue(`track_${index}`)
    );

    if (trackOptions.length === 0) {
        trackOptions.push(
            new StringSelectMenuOptionBuilder()
                .setLabel('Queue is empty')
                .setDescription('Use /play to add more music.')
                .setValue('no_tracks')
        );
    }

    const row3 = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('player_tracks')
            .setPlaceholder(`📀 View Queue Tracks (${queueSize})`)
            .addOptions(trackOptions)
    );

    const row4 = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('player_features')
            .setPlaceholder('⚡ More Features...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Detailed Now Playing')
                    .setDescription('Show detailed playback information.')
                    .setValue('feature_nowplaying'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Clear Queue')
                    .setDescription('Remove all upcoming tracks.')
                    .setValue('feature_clear'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Restart Track')
                    .setDescription('Jump back to the start of the current track.')
                    .setValue('feature_restart'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Player Statistics')
                    .setDescription('Show queue, volume, and channel stats.')
                    .setValue('feature_stats')
            )
    );

    return [row1, row2, row3, row4];
}

function buildQueueEmbed(player, limit = 10) {
    const current = player.queue.current;
    const tracks = player.queue.slice(0, limit);
    let description = '';

    if (current) {
        description += `**Now Playing:**\n[${current.title}](${current.uri}) - ${formatDuration(current.length)}\n\n`;
    }

    if (tracks.length > 0) {
        description += '**Up Next:**\n';
        tracks.forEach((track, index) => {
            description += `${index + 1}. [${track.title}](${track.uri}) - ${formatDuration(track.length)}\n`;
        });
    }

    if (player.queue.length > limit) {
        description += `\n...and ${player.queue.length - limit} more track(s)`;
    }

    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📋 Queue')
        .setDescription(description || 'Queue is empty.')
        .setFooter({ text: `Total: ${(current ? 1 : 0) + player.queue.length} track(s)` });
}

function buildNowPlayingEmbed(player) {
    const track = player.queue.current;
    const progressBar = createProgressBar(player.position, track.length, 20);

    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎵 Now Playing')
        .setDescription(
            `**[${track.title}](${track.uri})**\n\n` +
            `${progressBar}\n` +
            `\`${formatDuration(player.position)}\` / \`${formatDuration(track.length)}\``
        )
        .setThumbnail(track.thumbnail || null)
        .addFields(
            { name: 'Author', value: track.author || 'Unknown', inline: true },
            { name: 'Requested by', value: track.requester?.tag || 'Unknown', inline: true },
            { name: 'Volume', value: `${player.volume}%`, inline: true },
            { name: 'Loop', value: player.loop || 'Off', inline: true }
        );
}

function buildTrackDetailsEmbed(track, index) {
    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📀 Track #${index + 1}`)
        .setDescription(`**[${track.title}](${track.uri})**`)
        .addFields(
            { name: 'Author', value: track.author || 'Unknown', inline: true },
            { name: 'Duration', value: formatDuration(track.length), inline: true },
            { name: 'Requested by', value: track.requester?.tag || 'Unknown', inline: true }
        )
        .setThumbnail(track.thumbnail || null);
}

function buildStatsEmbed(player) {
    const current = player.queue.current;
    const totalQueueDuration = player.queue.reduce((sum, track) => sum + track.length, 0);

    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 Player Statistics')
        .addFields(
            { name: 'Current Track', value: current?.title?.slice(0, 1024) || 'None', inline: false },
            { name: 'Volume', value: `${player.volume}%`, inline: true },
            { name: 'Loop', value: player.loop || 'Off', inline: true },
            { name: 'Status', value: player.paused ? 'Paused' : 'Playing', inline: true },
            { name: 'Queue Size', value: `${player.queue.length} track(s)`, inline: true },
            { name: 'Queue Duration', value: formatDuration(totalQueueDuration), inline: true },
            { name: 'Voice Channel', value: `<#${player.voiceId}>`, inline: true }
        );
}

module.exports = {
    buildPlayerEmbed,
    buildPlayerComponents,
    buildQueueEmbed,
    buildNowPlayingEmbed,
    buildTrackDetailsEmbed,
    buildStatsEmbed
};
