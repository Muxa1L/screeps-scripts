var assert = require('assert');

module.exports.loop = function () {
    assert.safeTick('globals',    function () { require('globals').tick(); });
    assert.safeTick('roomManager', function () { require('roomManager').tick(); });

    if (Game.cpu.bucket > 1000) {
        assert.safeTick('creepManager', function () { require('creepManager').tick(); });
    }
    if (Game.cpu.bucket > 2000) {
        assert.safeTick('spawnManager', function () { require('spawnManager').tick(); });
    }
    if (Game.cpu.bucket > 500) {
        assert.safeTick('misc.upkeep',  function () { require('misc.upkeep').run(); });
    }

    if (Game.time % 100 === 0) {
        var meta = '[' + Game.time + '] [meta] bucket=' + Game.cpu.bucket +
            ' gcl=' + (Game.gcl ? Game.gcl.level : '?') +
            ' cpu=' + Game.cpu.getUsed().toFixed(2) +
            ' errors=' + (Memory.stats && Memory.stats.errors ? Object.keys(Memory.stats.errors).length : 0);
        console.log(meta);
    }
};
