module.exports.loop = function () {
    require('pathCache').cleanup();
    require('globals').tick();
    require('roomManager').tick();
    if (Game.cpu.bucket > 1000) {
        require('creepManager').tick();
    }
    if (Game.cpu.bucket > 2000) {
        require('spawnManager').tick();
    }
    if (Game.cpu.bucket > 500) {
        require('misc.upkeep').run();
    }
    if (Game.time % 100 === 0) {
        console.log('[' + Game.time + '] [meta] bucket=' + Game.cpu.bucket + ' gcl=' + (Game.gcl ? Game.gcl.level : '?') + ' cpu=' + Game.cpu.getUsed().toFixed(2));
    }
};
