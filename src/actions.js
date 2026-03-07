const { toErrorMessage } = require('./music/errors');

function ok(data = {}) {
    return { ok: true, data };
}

function fail(code, message) {
    return { ok: false, code, message };
}

function createActions(runtime) {
    async function ensurePlayableGuild(guildId) {
        const gate = runtime.getPlaybackGate(guildId);
        return gate.ok ? ok() : fail(gate.code, gate.message);
    }

    async function ensureMutablePlayback(player) {
        if (!player?.guildId) {
            return fail('missing-player', 'No active player is available.');
        }

        const gate = runtime.getPlaybackGate(player.guildId);
        return gate.ok ? ok() : fail(gate.code, gate.message);
    }

    return {
        async playQuery({ guild, channel, voiceChannel, query, requester }) {
            const gate = await ensurePlayableGuild(guild.id);
            if (!gate.ok) return gate;

            let player = runtime.getLivePlayer(guild.id);
            let createdPlayer = false;

            try {
                if (!player) {
                    runtime.setGuildStatus(guild.id, 'joining');
                    player = await runtime.createPlayerWithRecovery({
                        guildId: guild.id,
                        textId: channel.id,
                        voiceId: voiceChannel.id,
                        volume: 30,
                        deaf: true
                    }, 'Play');
                    createdPlayer = true;
                }

                const result = await runtime.kazagumo.search(query, { requester });
                if (!result.tracks.length) {
                    if (createdPlayer && !player.playing && player.queue.length === 0) {
                        await runtime.safeDestroyPlayer(guild.id, player, { allowForce: true });
                    }
                    runtime.setGuildStatus(guild.id, 'idle');
                    return fail('no-results', 'âŒ No results found!');
                }

                if (result.type === 'PLAYLIST') {
                    for (const track of result.tracks) {
                        player.queue.add(track);
                    }
                } else {
                    player.queue.add(result.tracks[0]);
                }

                const wasPlaying = player.playing;
                if (!player.playing && !player.paused) {
                    const playResult = await runtime.safePlayerAction(player, 'play', () => player.play(), { throwOnError: false });
                    if (!playResult.ok) {
                        if (createdPlayer) {
                            await runtime.safeDestroyPlayer(guild.id, player, { allowForce: true });
                        }
                        runtime.setGuildStatus(guild.id, 'reconnecting', playResult.reason);
                        return fail('playback-unavailable', 'The music service entered recovery while handling `/play`. Please try again in a few seconds.');
                    }
                }

                runtime.invalidateSnapshot(guild.id);
                runtime.setGuildStatus(guild.id, player.paused ? 'paused' : 'playing');

                return ok({
                    type: result.type,
                    track: result.tracks[0],
                    playlistName: result.playlistName,
                    playlistCount: result.tracks.length,
                    alreadyPlaying: wasPlaying
                });
            } catch (error) {
                runtime.setGuildStatus(guild.id, 'failed', toErrorMessage(error));
                return fail('error', `âŒ Error: ${toErrorMessage(error)}`);
            }
        },

        async joinVoice({ guild, channel, voiceChannel }) {
            const gate = await ensurePlayableGuild(guild.id);
            if (!gate.ok) return gate;

            try {
                let player = runtime.getLivePlayer(guild.id);
                if (!player) {
                    runtime.setGuildStatus(guild.id, 'joining');
                    player = await runtime.createPlayerWithRecovery({
                        guildId: guild.id,
                        textId: channel.id,
                        voiceId: voiceChannel.id,
                        volume: 30,
                        deaf: true
                    }, 'Join');
                }

                runtime.invalidateSnapshot(guild.id);
                runtime.setGuildStatus(guild.id, 'idle');
                return ok({ player });
            } catch (error) {
                runtime.setGuildStatus(guild.id, 'failed', toErrorMessage(error));
                return fail('error', `âŒ Failed to join: ${toErrorMessage(error)}`);
            }
        },

        async leaveVoice({ guildId, player }) {
            runtime.invalidateSnapshot(guildId);
            runtime.markSuppressEmptyNotice(guildId);
            runtime.setGuildStatus(guildId, 'leaving');
            await runtime.safeDestroyPlayer(guildId, player, { allowForce: true });
            runtime.setGuildStatus(guildId, 'idle');
            return ok();
        },

        async pause(player) {
            const gate = await ensureMutablePlayback(player);
            if (!gate.ok) return gate;

            const result = await runtime.safePlayerAction(player, 'pause', () => player.pause(true), { throwOnError: false });
            if (!result.ok) return fail(result.reason, 'âŒ Failed to pause. Please try again.');
            runtime.setGuildStatus(player.guildId, 'paused');
            runtime.clearPlayerInterval(player.guildId);
            await runtime.updatePlayerMessage(player);
            return ok();
        },

        async resume(player) {
            const gate = await ensureMutablePlayback(player);
            if (!gate.ok) return gate;

            const result = await runtime.safePlayerAction(player, 'resume', () => player.pause(false), { throwOnError: false });
            if (!result.ok) return fail(result.reason, 'âŒ Failed to resume. Please try again.');
            runtime.setGuildStatus(player.guildId, 'playing');
            runtime.startPlayerInterval(player);
            await runtime.updatePlayerMessage(player);
            return ok();
        },

        async skip(player) {
            const gate = await ensureMutablePlayback(player);
            if (!gate.ok) return gate;

            const result = await runtime.safePlayerAction(player, 'skip', () => player.skip(), { throwOnError: false });
            return result.ok ? ok() : fail(result.reason, 'âŒ Failed to skip. Please try again.');
        },

        async stop(player) {
            runtime.markSuppressEmptyNotice(player.guildId);
            runtime.invalidateSnapshot(player.guildId);
            runtime.clearPlayerMessage(player.guildId);
            runtime.setGuildStatus(player.guildId, 'idle');
            await runtime.stopPlaybackKeepVoice(player);
            return ok();
        },

        async restart(player) {
            const gate = await ensureMutablePlayback(player);
            if (!gate.ok) return gate;

            const result = await runtime.safePlayerAction(player, 'restart', () => player.seek(0), { throwOnError: false });
            if (!result.ok) return fail(result.reason, 'âŒ Failed to restart track.');
            await runtime.updatePlayerMessage(player);
            return ok();
        },

        async setVolume(player, level) {
            const gate = await ensureMutablePlayback(player);
            if (!gate.ok) return gate;

            const result = await runtime.safePlayerAction(player, 'setVolume', () => player.setVolume(level), { throwOnError: false });
            if (!result.ok) return fail(result.reason, 'âŒ Failed to set volume. Please try again.');
            await runtime.updatePlayerMessage(player);
            return ok({ level });
        },

        async changeVolume(player, delta) {
            const level = Math.max(0, Math.min(100, player.volume + delta));
            return this.setVolume(player, level);
        },

        async shuffle(player) {
            const gate = await ensureMutablePlayback(player);
            if (!gate.ok) return gate;

            player.queue.shuffle();
            await runtime.updatePlayerMessage(player);
            return ok();
        },

        async setLoop(player, mode) {
            const gate = await ensureMutablePlayback(player);
            if (!gate.ok) return gate;

            const result = await runtime.safePlayerAction(player, 'setLoop', () => player.setLoop(mode), { throwOnError: false });
            if (!result.ok) return fail(result.reason, 'âŒ Failed to set loop mode.');
            await runtime.updatePlayerMessage(player);
            return ok({ mode });
        },

        async cycleLoop(player) {
            const modes = ['none', 'track', 'queue'];
            const current = player.loop || 'none';
            const next = modes[(modes.indexOf(current) + 1) % modes.length];
            return this.setLoop(player, next);
        },

        async clearQueue(player) {
            const gate = await ensureMutablePlayback(player);
            if (!gate.ok) return gate;

            const queueLength = player.queue.length;
            player.queue.clear();
            await runtime.updatePlayerMessage(player);
            return ok({ queueLength });
        }
    };
}

module.exports = {
    createActions
};
