var move = require('moveUtil');
var spawnUtil = require('spawnUtil');

function run(creep) {
    var spawn = spawnUtil.nearestSpawn(creep);
    if (!spawn) return;
    if (creep.body.length < 6) {
        if (spawn.recycleCreep(creep) === ERR_NOT_IN_RANGE) {
            move.moveCreep(creep, spawn, { visualizePathStyle: { stroke: '#ff8800' } });
        }
        return;
    }
    var res = spawn.renewCreep(creep);
    if (res === ERR_NOT_IN_RANGE) {
        move.moveCreep(creep, spawn, { visualizePathStyle: { stroke: '#88ffff' } });
    }
}

module.exports = {
    run: run,
};
