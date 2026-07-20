var assert = require('utils.assert');

var RAMPART_TARGET_HITS = 100000;
var SAFE_MODE_TRIGGER_HITS = 5000;
var CRITICAL_CREEP_AGE = 5;
var STUCK_THRESHOLD = 200;
var MAX_RECYCLES_PER_TICK = 3;

var _recyclesThisTick = 0;
var _lastTick = -1;

function run() {
    if (_lastTick !== Game.time) {
        _lastTick = Game.time;
        _recyclesThisTick = 0;
    }

    assert.safeRun('towers', function () {
        for (var name in Game.structures) {
            var s = Game.structures[name];
            if (!s.structureType) continue;
            if (s.structureType === STRUCTURE_TOWER) {
                runTower(s);
            }
        }
    });

    assert.safeRun('safeMode', function () {
        var spawn = Game.spawns['Spawn1'];
        if (!spawn) return;
        if (spawn.hits < SAFE_MODE_TRIGGER_HITS && spawn.my && spawn.room && spawn.room.controller) {
            if (spawn.room.controller.safeModeAvailable > 0 && !spawn.room.controller.safeMode) {
                var res = spawn.room.controller.activateSafeMode();
                if (Game.time % 100 === 0) console.log('[' + Game.time + '] [safe-mode] activate -> ' + res);
            }
        }
    });

    assert.safeRun('creepMemoryCleanup', function () {
        if (!Memory.creeps) return;
        for (var cname in Memory.creeps) {
            if (Game.creeps[cname]) continue;
            delete Memory.creeps[cname];
            if (Memory.sources) {
                for (var sid in Memory.sources) {
                    var slots = Memory.sources[sid].slots;
                    if (!slots) continue;
                    for (var si = 0; si < slots.length; si++) {
                        if (slots[si].claimedBy === cname) slots[si].claimedBy = null;
                    }
                }
            }
        }
    });

    assert.safeRun('stuckRecycle', function () {
        if (!Memory.flags || !Memory.flags.stuckRecycle) return;
        if (_recyclesThisTick >= MAX_RECYCLES_PER_TICK) return;
        var spawn = Game.spawns['Spawn1'];
        if (!spawn) return;
        for (var name in Game.creeps) {
            if (_recyclesThisTick >= MAX_RECYCLES_PER_TICK) break;
            var c = Game.creeps[name];
            if (c.ticksToLive < 100) continue;
            var lastChange = c.memory._lastTaskChange || 0;
            if (Game.time - lastChange < STUCK_THRESHOLD) continue;
            if (c.getActiveBodyparts(MOVE) === 0) continue;
            console.log('[' + Game.time + '] [stuck-recycle] ' + c.name + ' idle for ' + (Game.time - lastChange) + ' ticks');
            if (spawn.recycleCreep(c) === ERR_NOT_IN_RANGE) {
                c.moveTo(spawn, { reusePath: 10 });
            }
            c.memory._lastTaskChange = Game.time;
            _recyclesThisTick++;
        }
    });

    assert.safeRun('memoryWatchdog', function () {
        if (!Memory.creeps) return;
        if (Game.time % 50 !== 0) return;
        var ghostCount = 0;
        for (var cname in Memory.creeps) {
            if (Game.creeps[cname]) continue;
            ghostCount++;
        }
        if (ghostCount > CRITICAL_CREEP_AGE) {
            assert.recordError('memoryWatchdog', {
                message: 'critical: ' + ghostCount + ' ghost creeps in memory after ' + CRITICAL_CREEP_AGE + '+ ticks',
            });
        }
    });
}

function runTower(tower) {
    var closestHostile = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (closestHostile) {
        tower.attack(closestHostile);
        return;
    }
    var closestDamagedCreep = tower.pos.findClosestByRange(FIND_MY_CREEPS, {
        filter: function (c) { return c.hits < c.hitsMax; },
    });
    if (closestDamagedCreep) {
        tower.heal(closestDamagedCreep);
        return;
    }
    var damaged = tower.pos.findClosestByRange(FIND_STRUCTURES, {
        filter: function (s) {
            if (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) {
                return s.hits < RAMPART_TARGET_HITS;
            }
            if (s.hits >= s.hitsMax) return false;
            return s.structureType === STRUCTURE_CONTAINER ||
                   s.structureType === STRUCTURE_ROAD ||
                   s.structureType === STRUCTURE_SPAWN ||
                   s.structureType === STRUCTURE_EXTENSION;
        },
    });
    if (damaged) {
        tower.repair(damaged);
    }
}

module.exports = {
    run: run,
    runTower: runTower,
};
