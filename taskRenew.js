var move = require('moveUtil');
var spawnUtil = require('spawnUtil');

function run(creep) {
    var spawn = spawnUtil.nearestSpawn(creep);
    if (!spawn) return;
    if (creep.getActiveBodyparts(WORK) === 0 && creep.getActiveBodyparts(CARRY) === 0 &&
        creep.getActiveBodyparts(ATTACK) === 0 && creep.getActiveBodyparts(RANGED_ATTACK) === 0 &&
        creep.getActiveBodyparts(HEAL) === 0) {
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
