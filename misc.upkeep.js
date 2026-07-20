var assert = require('assert');
var spawnUtil = require('spawnUtil');
var constructionPlanner = require('constructionPlanner');

var RAMPART_TARGET_HITS = 100000;
var SAFE_MODE_TRIGGER_HITS = 5000;
var SAFE_MODE_TTD_THRESHOLD = 3000;
var CRITICAL_CREEP_AGE = 5;
var STUCK_THRESHOLD = 200;
var MAX_RECYCLES_PER_TICK = 3;
var _lastSafeModeActivate = 0;
var SAFE_MODE_COOLDOWN_TICKS = 5000;

var TOWER_MIN_ATTACK_ENERGY = 10;
var TOWER_MIN_HEAL_ENERGY = 250;
var TOWER_MIN_REPAIR_ENERGY = 500;

var _recyclesThisTick = 0;
var _lastTick = -1;

function run() {
    if (_lastTick !== Game.time) {
        _lastTick = Game.time;
        _recyclesThisTick = 0;
    }

    assert.safeRun('constructionPlanner', function () {
        for (var rn in Game.rooms) {
            var r = Game.rooms[rn];
            if (!r.controller || !r.controller.my) continue;
            constructionPlanner.tick(r);
        }
    });

    assert.safeRun('towers', function () {
        for (var name in Game.structures) {
            var s = Game.structures[name];
            if (!s.structureType) continue;
            if (s.structureType === STRUCTURE_TOWER) {
                runTower(s);
            }
        }
    });

    assert.safeRun('links', function () {
        for (var lname in Game.structures) {
            var link = Game.structures[lname];
            if (!link.structureType || link.structureType !== STRUCTURE_LINK) continue;
            if (link.cooldown > 0) continue;
            runLink(link);
        }
    });

    assert.safeRun('safeMode', function () {
        for (var rn in Game.rooms) {
            var room = Game.rooms[rn];
            var controller = room.controller;
            if (!controller || !controller.my) continue;
            var spawnsHere = spawnUtil.spawnsInRoom(room);
            if (spawnsHere.length === 0) continue;
            var lowHealth = false;
            for (var i = 0; i < spawnsHere.length; i++) {
                if (spawnsHere[i].hits < SAFE_MODE_TRIGGER_HITS) { lowHealth = true; break; }
            }
            var hostiles = room.find(FIND_HOSTILE_CREEPS);
            var ttd = controller.ticksToDowngrade;
            var lowTtd = typeof ttd === 'number' && ttd < SAFE_MODE_TTD_THRESHOLD && hostiles.length > 0;

            if ((lowHealth || lowTtd) &&
                controller.safeModeAvailable > 0 &&
                !controller.safeMode &&
                Game.time - _lastSafeModeActivate > SAFE_MODE_COOLDOWN_TICKS) {
                var res = controller.activateSafeMode();
                if (res === OK) {
                    _lastSafeModeActivate = Game.time;
                    console.log('[' + Game.time + '] [safe-mode] [' + rn + '] activate -> ' + res + (lowTtd ? ' (ttd=' + ttd + ')' : ' (spawn-low)'));
                } else if (Game.time % 100 === 0) {
                    console.log('[' + Game.time + '] [safe-mode] [' + rn + '] activate -> ' + res);
                }
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
        for (var name in Game.creeps) {
            if (_recyclesThisTick >= MAX_RECYCLES_PER_TICK) break;
            var c = Game.creeps[name];
            if (c.ticksToLive < 100) continue;
            var lastChange = c.memory._lastTaskChange || 0;
            if (Game.time - lastChange < STUCK_THRESHOLD) continue;
            if (c.getActiveBodyparts(MOVE) === 0) continue;
            var spawn = spawnUtil.nearestSpawn(c);
            if (!spawn) continue;
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
    var energy = tower.energy;
    var closestHostile = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (closestHostile && energy >= TOWER_MIN_ATTACK_ENERGY) {
        tower.attack(closestHostile);
        return;
    }
    if (energy >= TOWER_MIN_HEAL_ENERGY) {
        var closestDamagedCreep = tower.pos.findClosestByRange(FIND_MY_CREEPS, {
            filter: function (c) { return c.hits < c.hitsMax; },
        });
        if (closestDamagedCreep) {
            tower.heal(closestDamagedCreep);
            return;
        }
    }
    if (energy >= TOWER_MIN_REPAIR_ENERGY) {
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
}

function runLink(link) {
    var room = link.room;
    if (!room) return;

    var isSourceLink = false;
    var sources = room.find(FIND_SOURCES);
    for (var i = 0; i < sources.length; i++) {
        if (link.pos.inRangeTo(sources[i].pos, 3)) {
            isSourceLink = true;
            break;
        }
    }
    if (!isSourceLink) return;

    if (link.store[RESOURCE_ENERGY] < 50) return;

    var storageLink = null;
    if (room.storage) {
        var allLinks = room.find(FIND_STRUCTURES, {
            filter: function (s) { return s.structureType === STRUCTURE_LINK; },
        });
        for (var j = 0; j < allLinks.length; j++) {
            if (allLinks[j].id === link.id) continue;
            if (allLinks[j].pos.inRangeTo(room.storage.pos, 3)) {
                storageLink = allLinks[j];
                break;
            }
        }
    }

    var controllerLink = null;
    if (room.controller && room.controller.my) {
        var allLinks2 = room.find(FIND_STRUCTURES, {
            filter: function (s) { return s.structureType === STRUCTURE_LINK; },
        });
        for (var k = 0; k < allLinks2.length; k++) {
            if (allLinks2[k].id === link.id) continue;
            if (allLinks2[k].pos.inRangeTo(room.controller.pos, 3)) {
                controllerLink = allLinks2[k];
                break;
            }
        }
    }

    var target = controllerLink || storageLink;
    if (!target) return;
    if (target.store[RESOURCE_ENERGY] >= target.store.getCapacity(RESOURCE_ENERGY) - 10) return;

    link.transferEnergy(target);
}

module.exports = {
    run: run,
    runTower: runTower,
};
