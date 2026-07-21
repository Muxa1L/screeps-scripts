const constants = require('../../config/constants');
const memory = require('../../utils/memorySchema');
const spawnUtil = require('../../utils/spawnUtil');

const STUCK_THRESHOLD = constants.STUCK_THRESHOLD;
const MAX_RECYCLES_PER_TICK = constants.MAX_RECYCLES_PER_TICK;

let _recyclesThisTick = 0;
let _lastTick = -1;

function resetCounter() {
    if (_lastTick !== Game.time) {
        _lastTick = Game.time;
        _recyclesThisTick = 0;
    }
}

function recycleCreep(creep) {
    if (_recyclesThisTick >= MAX_RECYCLES_PER_TICK) return;
    const spawn = spawnUtil.nearestSpawn(creep);
    if (!spawn) return;
    const recycleRes = spawn.recycleCreep(creep);
    if (recycleRes === OK) {
        _recyclesThisTick++;
    } else if (recycleRes === ERR_NOT_IN_RANGE) {
        creep.moveTo(spawn, { reusePath: 10 });
    }
}

function runStuckRecycle() {
    resetCounter();
    if (!Memory.flags || !Memory.flags.stuckRecycle) return;
    if (_recyclesThisTick >= MAX_RECYCLES_PER_TICK) return;

    for (const name in Game.creeps) {
        if (_recyclesThisTick >= MAX_RECYCLES_PER_TICK) break;
        const c = Game.creeps[name];
        if (c.ticksToLive < 100) continue;

        if (memory.getRecycling(c)) {
            recycleCreep(c);
            continue;
        }

        const lastChange = memory.getLastTaskChange(c);
        if (Game.time - lastChange < STUCK_THRESHOLD) continue;
        if (c.getActiveBodyparts(MOVE) === 0) continue;

        console.log('[' + Game.time + '] [stuck-recycle] ' + c.name + ' idle for ' + (Game.time - lastChange) + ' ticks');
        const spawn = spawnUtil.nearestSpawn(c);
        if (!spawn) continue;
        const recycleRes = spawn.recycleCreep(c);
        if (recycleRes === OK) {
            _recyclesThisTick++;
        } else if (recycleRes === ERR_NOT_IN_RANGE) {
            c.moveTo(spawn, { reusePath: 10 });
            memory.setRecycling(c, Game.time);
        }
    }
}

module.exports = {
    runStuckRecycle: runStuckRecycle,
};
