const move = require('../../utils/moveUtil');
const spawnUtil = require('../../utils/spawnUtil');
const memory = require('../../utils/memorySchema');

function run(creep, _snap) {
    const spawn = spawnUtil.nearestSpawn(creep);
    if (!spawn) return;
    if (creep.getActiveBodyparts(WORK) === 0 && creep.getActiveBodyparts(CARRY) === 0 &&
        creep.getActiveBodyparts(ATTACK) === 0 && creep.getActiveBodyparts(RANGED_ATTACK) === 0 &&
        creep.getActiveBodyparts(HEAL) === 0 && creep.getActiveBodyparts(CLAIM) === 0) {
        if (spawn.recycleCreep(creep) === ERR_NOT_IN_RANGE) {
            move.moveCreep(creep, spawn, { visualizePathStyle: { stroke: '#ff8800' } });
        }
        return;
    }
    const res = spawn.renewCreep(creep);
    if (res === ERR_NOT_IN_RANGE) {
        move.moveCreep(creep, spawn, { visualizePathStyle: { stroke: '#88ffff' } });
    } else if (res === ERR_FULL) {
        memory.setRenewComplete(creep, Game.time);
    }
    // ERR_NOT_ENOUGH_ENERGY: wait silently; caller re-checks shouldRenew next tick
}

module.exports = {
    run: run,
};
