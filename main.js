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
};
