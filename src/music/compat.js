const { wait } = require('../utils');

function applyShoukakuCompat({ kazagumo, PlayerClass, normalizeVoiceEndpoint, isPlayerUpdateBadRequest }) {
    const connector = kazagumo.shoukaku.connector;
    if (connector?.raw) {
        const originalRaw = connector.raw.bind(connector);
        connector.raw = packet => {
            if (packet?.t === 'VOICE_SERVER_UPDATE' && typeof packet?.d?.endpoint === 'string') {
                packet.d.endpoint = normalizeVoiceEndpoint(packet.d.endpoint);
            }
            return originalRaw(packet);
        };
    }

    if (PlayerClass.prototype.__discordMusicCompatPatched) {
        return;
    }

    PlayerClass.prototype.__discordMusicCompatPatched = true;
    PlayerClass.prototype.sendServerUpdate = async function sendServerUpdate(connection) {
        const conn = connection || this.node?.manager?.connections?.get?.(this.guildId);
        const voicePayload = {
            token: conn?.serverUpdate?.token ?? null,
            endpoint: normalizeVoiceEndpoint(conn?.serverUpdate?.endpoint ?? null),
            sessionId: conn?.sessionId ?? null,
            channelId: conn?.channelId ?? conn?.lastChannelId ?? null
        };

        const missing = Object.entries(voicePayload)
            .filter(([, value]) => !value)
            .map(([key]) => key);

        if (missing.length > 0) {
            throw new Error(`[Voice] Incomplete voice state for guild ${this.guildId}. Missing: ${missing.join(', ')}`);
        }

        const payload = {
            guildId: this.guildId,
            playerOptions: {
                voice: voicePayload
            }
        };

        try {
            return await this.node.rest.updatePlayer(payload);
        } catch (error) {
            if (!isPlayerUpdateBadRequest(error)) throw error;
            await wait(700);
            return this.node.rest.updatePlayer(payload);
        }
    };
}

module.exports = {
    applyShoukakuCompat
};
