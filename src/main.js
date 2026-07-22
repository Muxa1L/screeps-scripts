const assert = require('./utils/assert');

// CPU history instrumentation. Records a rolling buffer of {tick, bucket, cpu}
// samples into Memory.stats.cpuHistory so it can be read back remotely via the
// memory API (which works on shard3, unlike the console endpoint).
const CPU_SAMPLE_INTERVAL = 5;
const CPU_HISTORY_MAX = 120;

function recordCpu() {
    if (Game.time % CPU_SAMPLE_INTERVAL !== 0) return;
    if (!Memory.stats) Memory.stats = {};
    const hist = Memory.stats.cpuHistory || (Memory.stats.cpuHistory = []);
    hist.push({ t: Game.time, b: Game.cpu.bucket, c: Game.cpu.getUsed() });
    if (hist.length > CPU_HISTORY_MAX) hist.shift();
}

module.exports.loop = function () {
    assert.safeTick('globals',    function () { require('./utils/globals').tick(); });
    assert.safeTick('roomManager', function () { require('./managers/roomManager').tick(); });
    // Register sources in visible whitelisted foreign rooms so the
    // remoteHarvest dispatcher has target positions to dispatch to.
    assert.safeTick('remoteSources', function () {
        const roomFlags = require('./utils/roomFlags');
        const sourceRegistry = require('./economy/sourceRegistry');
        const allowed = roomFlags.getAllowedRooms();
        for (const name in Game.rooms) {
            if (!allowed[name]) continue;
            const room = Game.rooms[name];
            if (room.controller && room.controller.my) continue;
            sourceRegistry.ensureRegistry(room);
        }
    });

    if (Game.cpu.bucket > 1000 || Game.shard.name === 'sim') {
        assert.safeTick('creepManager', function () { require('./managers/creepManager').tick(); });
    }
    if (Game.cpu.bucket > 2000 || Game.shard.name === 'sim') {
        assert.safeTick('spawnManager', function () { require('./managers/spawnManager').tick(); });
    }
    if (Game.cpu.bucket > 500 || Game.shard.name === 'sim') {
        assert.safeTick('upkeepManager',  function () { require('./managers/upkeepManager').run(); });
    }

    recordCpu();

    if (Game.time % 100 === 0) {
        const meta = '[' + Game.time + '] [meta] bucket=' + Game.cpu.bucket +
            ' gcl=' + (Game.gcl ? Game.gcl.level : '?') +
            ' cpu=' + Game.cpu.getUsed().toFixed(2) +
            ' errors=' + (Memory.stats && Memory.stats.errors ? Object.keys(Memory.stats.errors).length : 0);
        console.log(meta);
    }
};
