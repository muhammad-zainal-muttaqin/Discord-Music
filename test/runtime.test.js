const test = require('node:test');
const assert = require('node:assert/strict');

const { MusicRuntime } = require('../src/music/runtime');

function createRuntime() {
    const runtime = Object.create(MusicRuntime.prototype);
    runtime.client = { user: { id: 'bot-1' }, guilds: { cache: new Map() } };
    runtime.config = {
        lavalink: { name: 'Lavalink' },
        maxResumeAttempts: 3
    };
    runtime.guildStates = new Map();
    runtime.snapshots = new Map();
    runtime.kazagumo = {
        players: new Map(),
        shoukaku: {
            players: new Map(),
            connections: new Map(),
            addNode: () => {},
            removeNode: () => {}
        }
    };
    runtime.reconnectInFlight = false;
    runtime.isStartingUp = false;
    runtime.nodeStatus = 'ready';
    return runtime;
}

test('getPlaybackGate reports startup and recovering states correctly', () => {
    const runtime = createRuntime();
    runtime.isNodeOperational = () => false;
    runtime.isStartingUp = true;
    runtime.nodeStatus = 'starting';

    const startupGate = runtime.getPlaybackGate('guild-1');
    assert.deepEqual(startupGate, {
        ok: false,
        code: 'service-unavailable',
        message: 'The music service is still starting up. Please try again in a few seconds.'
    });

    runtime.isNodeOperational = () => true;
    runtime.getGuildState('guild-1').status = 'resuming';

    const guildGate = runtime.getPlaybackGate('guild-1');
    assert.deepEqual(guildGate, {
        ok: false,
        code: 'guild-recovering',
        message: 'Playback is recovering for this guild. Please try again in a few seconds.'
    });
});

test('invalidateSnapshot clears pending resume timers and deletes stored snapshots', () => {
    const runtime = createRuntime();
    const state = runtime.getGuildState('guild-1');
    state.resumeAttempts = 2;
    state.resumeTimer = setTimeout(() => {}, 10000);
    runtime.snapshots.set('guild-1', { version: 2 });

    runtime.invalidateSnapshot('guild-1');

    assert.equal(state.resumeAttempts, 0);
    assert.equal(state.resumeTimer, null);
    assert.equal(runtime.snapshots.has('guild-1'), false);
});

test('getLivePlayer force-cleans stale players without matching shoukaku state', () => {
    const runtime = createRuntime();
    const player = { guildId: 'guild-1' };
    runtime.kazagumo.players.set('guild-1', player);

    let cleanupArgs = null;
    runtime.hardCleanupGuildVoiceState = (guildId, options) => {
        cleanupArgs = { guildId, options };
        runtime.kazagumo.players.delete(guildId);
    };

    const livePlayer = runtime.getLivePlayer('guild-1');

    assert.equal(livePlayer, null);
    assert.deepEqual(cleanupArgs, {
        guildId: 'guild-1',
        options: { disconnectVoice: true }
    });
});

test('attemptReconnect does nothing while the node is already connecting', async () => {
    const runtime = createRuntime();
    const node = { state: 'CONNECTING' };
    let addNodeCalls = 0;
    runtime.getMainNode = () => node;
    runtime.isNodeOperational = () => false;
    runtime.kazagumo.shoukaku.addNode = () => {
        addNodeCalls += 1;
    };
    runtime.armReadyTimer = () => {
        throw new Error('armReadyTimer should not run');
    };

    await runtime.attemptReconnect();

    assert.equal(addNodeCalls, 0);
    assert.equal(runtime.reconnectInFlight, false);
});

test('resumeGuild abandons missing guilds and clears stored snapshots', async () => {
    const runtime = createRuntime();
    runtime.isNodeOperational = () => true;
    runtime.snapshots.set('guild-1', {
        version: 1,
        guildId: 'guild-1',
        voiceId: 'voice-1',
        textId: 'text-1'
    });

    await runtime.resumeGuild('guild-1', 1);

    assert.equal(runtime.getGuildState('guild-1').status, 'abandoned');
    assert.equal(runtime.snapshots.has('guild-1'), false);
});

test('resumeGuild stops retrying after max attempts for a guild', async () => {
    const runtime = createRuntime();
    runtime.isNodeOperational = () => true;
    runtime.snapshots.set('guild-1', {
        version: 3,
        guildId: 'guild-1',
        voiceId: 'voice-1',
        textId: 'text-1'
    });

    const state = runtime.getGuildState('guild-1');
    state.resumeAttempts = runtime.config.maxResumeAttempts;

    await runtime.resumeGuild('guild-1', 3);

    assert.equal(state.status, 'failed');
    assert.equal(runtime.snapshots.has('guild-1'), false);
});
