function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDuration(ms) {
    const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
    const seconds = Math.floor((safeMs / 1000) % 60);
    const minutes = Math.floor((safeMs / (1000 * 60)) % 60);
    const hours = Math.floor(safeMs / (1000 * 60 * 60));

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function createProgressBar(current, total, length = 12) {
    if (!Number.isFinite(total) || total <= 0) {
        return `🔘${'▬'.repeat(Math.max(length - 1, 0))}`;
    }

    const clampedCurrent = Math.max(0, Math.min(current, total));
    const progress = Math.round((clampedCurrent / total) * length);
    const filled = '▬'.repeat(Math.max(0, progress));
    const empty = '▬'.repeat(Math.max(length - progress - 1, 0));
    return `${filled}🔘${empty}`;
}

function normalizeVoiceEndpoint(endpoint) {
    if (typeof endpoint !== 'string') return endpoint;

    return endpoint
        .trim()
        .replace(/^wss?:\/\//i, '')
        .replace(/^https?:\/\//i, '')
        .replace(/\/+$/, '');
}

module.exports = {
    wait,
    formatDuration,
    createProgressBar,
    normalizeVoiceEndpoint
};
