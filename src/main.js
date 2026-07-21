const assert = require('./utils/assert');

module.exports.loop = function () {
    assert.safeTick('globals',    function () { require('./utils/globals').tick(); });
    assert.safeTick('roomManager', function () { require('./managers/roomManager').tick(); });

    if (Game.cpu.bucket > 1000 || Game.shard.name === 'sim') {
        assert.safeTick('creepManager', function () { require('./managers/creepManager').tick(); });
    }
    if (Game.cpu.bucket > 2000 || Game.shard.name === 'sim') {
        assert.safeTick('spawnManager', function () { require('./managers/spawnManager').tick(); });
    }
    if (Game.cpu.bucket > 500 || Game.shard.name === 'sim') {
        assert.safeTick('upkeepManager',  function () { require('./managers/upkeepManager').run(); });
    }

    if (Game.time % 100 === 0) {
        const meta = '[' + Game.time + '] [meta] bucket=' + Game.cpu.bucket +
            ' gcl=' + (Game.gcl ? Game.gcl.level : '?') +
            ' cpu=' + Game.cpu.getUsed().toFixed(2) +
            ' errors=' + (Memory.stats && Memory.stats.errors ? Object.keys(Memory.stats.errors).length : 0);
        console.log(meta);
    }
};
