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
        // Drive already-flagged recycles to completion regardless of TTL —
        // abandoning them at low TTL strands the creep mid-walk.
        if (memory.getRecycling(c)) {
            recycleCreep(c);
            continue;
        }
        if (c.ticksToLive < 100) continue;

        const lastChange = memory.getLastTaskChange(c);
        if (lastChange === 0) continue; // fresh creep, never assigned a task
        if (Game.time - lastChange < STUCK_THRESHOLD) continue;
        if (c.getActiveBodyparts(MOVE) === 0) continue;

        // Task tenure is NOT idleness: miners/upgraders/distributors hold one
        // constant-target task for their whole life. Confirm actual idleness —
        // only recycle if the creep hasn't MOVED for STUCK_THRESHOLD ticks.
        const pos = memory.getStuckPos(c);
        if (pos && (pos.x !== c.pos.x || pos.y !== c.pos.y || pos.roomName !== c.pos.roomName)) {
            // Creep moved since last check: not stuck. Refresh anchor + timer.
            memory.setStuckPos(c, Game.time);
            continue;
        }
        if (!pos) {
            memory.setStuckPos(c, Game.time);
            continue;
        }
        if (Game.time - pos.tick < STUCK_THRESHOLD) continue;

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
