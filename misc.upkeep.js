const assert = require('assert');
const spawnUtil = require('spawnUtil');
const constructionPlanner = require('constructionPlanner');
const roomManager = require('roomManager');

const RAMPART_TARGET_HITS = 100000;
const SAFE_MODE_TRIGGER_HITS = 5000;
const SAFE_MODE_TTD_THRESHOLD = 3000;
const CRITICAL_CREEP_AGE = 5;
const STUCK_THRESHOLD = 200;
const MAX_RECYCLES_PER_TICK = 3;
const SAFE_MODE_COOLDOWN_TICKS = 5000;
const SAFE_MODE_MEMORY_KEY = 'lastSafeModeActivate';

function getLastSafeModeActivate(roomName) {
    if (!Memory.rooms) return 0;
    if (!Memory.rooms[roomName]) return 0;
    return Memory.rooms[roomName][SAFE_MODE_MEMORY_KEY] || 0;
}

function setLastSafeModeActivate(roomName, tick) {
    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
    Memory.rooms[roomName][SAFE_MODE_MEMORY_KEY] = tick;
}

const TOWER_MIN_ATTACK_ENERGY = 250;
const TOWER_MIN_HEAL_ENERGY = 250;
const TOWER_MIN_REPAIR_ENERGY = 500;

let _recyclesThisTick = 0;
let _lastTick = -1;

function run() {
    if (_lastTick !== Game.time) {
        _lastTick = Game.time;
        _recyclesThisTick = 0;
    }

    assert.safeRun('constructionPlanner', function () {
        for (const rn in Game.rooms) {
            const r = Game.rooms[rn];
            if (!r.controller || !r.controller.my) continue;
            constructionPlanner.tick(r);
        }
    });

    assert.safeRun('towers', function () {
        for (const name in Game.structures) {
            const s = Game.structures[name];
            if (!s.structureType) continue;
            if (s.structureType === STRUCTURE_TOWER) {
                runTower(s);
            }
        }
    });

    assert.safeRun('links', function () {
        for (const lname in Game.structures) {
            const link = Game.structures[lname];
            if (!link.structureType || link.structureType !== STRUCTURE_LINK) continue;
            if (link.cooldown > 0) continue;
            runLink(link);
        }
    });

    assert.safeRun('safeMode', function () {
        for (const rn in Game.rooms) {
            const room = Game.rooms[rn];
            const controller = room.controller;
            if (!controller || !controller.my) continue;
            const spawnsHere = spawnUtil.spawnsInRoom(room);
            if (spawnsHere.length === 0) continue;
            let lowHealth = false;
            for (let i = 0; i < spawnsHere.length; i++) {
                if (spawnsHere[i].hits < SAFE_MODE_TRIGGER_HITS) { lowHealth = true; break; }
            }
            const snap = roomManager.get(rn);
            const hostileCount = snap ? snap.hostiles.length : room.find(FIND_HOSTILE_CREEPS).length;
            const ttd = controller.ticksToDowngrade;
            const lowTtd = typeof ttd === 'number' && ttd < SAFE_MODE_TTD_THRESHOLD && hostileCount > 0;

            const lastSafeMode = getLastSafeModeActivate(rn);
            if ((lowHealth || lowTtd) &&
                controller.safeModeAvailable > 0 &&
                !controller.safeMode &&
                Game.time - lastSafeMode > SAFE_MODE_COOLDOWN_TICKS) {
                const res = controller.activateSafeMode();
                if (res === OK) {
                    setLastSafeModeActivate(rn, Game.time);
                    console.log('[' + Game.time + '] [safe-mode] [' + rn + '] activate -> ' + res + (lowTtd ? ' (ttd=' + ttd + ')' : ' (spawn-low)'));
                } else if (Game.time % 100 === 0) {
                    console.log('[' + Game.time + '] [safe-mode] [' + rn + '] activate -> ' + res);
                }
            }
        }
    });

    assert.safeRun('creepMemoryCleanup', function () {
        if (!Memory.creeps) return;
        const dead = [];
        for (const cname in Memory.creeps) {
            if (Game.creeps[cname]) continue;
            dead.push(cname);
            delete Memory.creeps[cname];
        }
        if (dead.length === 0 || !Memory.sources) return;
        const deadSet = {};
        for (let i = 0; i < dead.length; i++) deadSet[dead[i]] = true;
        for (const sid in Memory.sources) {
            const slots = Memory.sources[sid].slots;
            if (!slots) continue;
            for (let si = 0; si < slots.length; si++) {
                if (deadSet[slots[si].claimedBy]) slots[si].claimedBy = null;
            }
        }
    });

    assert.safeRun('stuckRecycle', function () {
        if (!Memory.flags || !Memory.flags.stuckRecycle) return;
        if (_recyclesThisTick >= MAX_RECYCLES_PER_TICK) return;
        for (const name in Game.creeps) {
            if (_recyclesThisTick >= MAX_RECYCLES_PER_TICK) break;
            const c = Game.creeps[name];
            if (c.ticksToLive < 100) continue;
            const lastChange = c.memory._lastTaskChange || 0;
            if (c.memory._recycling) {
                const spawn = spawnUtil.nearestSpawn(c);
                if (spawn) {
                    const recycleRes = spawn.recycleCreep(c);
                    if (recycleRes === OK) {
                        _recyclesThisTick++;
                    } else if (recycleRes === ERR_NOT_IN_RANGE) {
                        c.moveTo(spawn, { reusePath: 10 });
                    }
                }
                continue;
            }
            if (Game.time - lastChange < STUCK_THRESHOLD) continue;
            if (c.getActiveBodyparts(MOVE) === 0) continue;
            const spawn = spawnUtil.nearestSpawn(c);
            if (!spawn) continue;
            console.log('[' + Game.time + '] [stuck-recycle] ' + c.name + ' idle for ' + (Game.time - lastChange) + ' ticks');
            const recycleRes = spawn.recycleCreep(c);
            if (recycleRes === OK) {
                _recyclesThisTick++;
            } else if (recycleRes === ERR_NOT_IN_RANGE) {
                c.moveTo(spawn, { reusePath: 10 });
                c.memory._recycling = Game.time;
            }
        }
    });

    assert.safeRun('memoryWatchdog', function () {
        if (!Memory.creeps) return;
        if (Game.time % 50 !== 0) return;
        let ghostCount = 0;
        for (const cname in Memory.creeps) {
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

function closestByRangeFrom(pos, candidates) {
    let best = null;
    let bestRange = Infinity;
    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const r = pos.getRangeTo(c);
        if (r < bestRange) {
            bestRange = r;
            best = c;
        }
    }
    return best;
}

function runTower(tower) {
    const energy = tower.energy;
    const snap = roomManager.get(tower.room.name);
    let closestHostile = null;
    if (snap) {
        if (snap.hostiles.length > 0) closestHostile = closestByRangeFrom(tower.pos, snap.hostiles);
    } else {
        closestHostile = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    }
    if (closestHostile && energy >= TOWER_MIN_ATTACK_ENERGY) {
        tower.attack(closestHostile);
        return;
    }
    if (energy >= TOWER_MIN_HEAL_ENERGY) {
        let closestDamagedCreep = null;
        if (snap) {
            if (snap.damagedFriendlies.length > 0) {
                closestDamagedCreep = closestByRangeFrom(tower.pos, snap.damagedFriendlies);
            }
        } else {
            closestDamagedCreep = tower.pos.findClosestByRange(FIND_MY_CREEPS, {
                filter: function (c) { return c.hits < c.hitsMax; },
            });
        }
        if (closestDamagedCreep) {
            tower.heal(closestDamagedCreep);
            return;
        }
    }
    if (energy >= TOWER_MIN_REPAIR_ENERGY) {
        const damaged = tower.pos.findClosestByRange(FIND_STRUCTURES, {
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
    const room = link.room;
    if (!room) return;
    const snap = roomManager.get(room.name);

    let isSourceLink = false;
    const sources = snap ? snap.sources : room.find(FIND_SOURCES);
    for (let i = 0; i < sources.length; i++) {
        if (link.pos.inRangeTo(sources[i].pos, 3)) {
            isSourceLink = true;
            break;
        }
    }
    if (!isSourceLink) return;

    if (link.store[RESOURCE_ENERGY] < 50) return;

    let storageLink = null;
    let controllerLink = null;
    const allLinks = snap ? snap.links : room.find(FIND_STRUCTURES, {
        filter: function (s) { return s.structureType === STRUCTURE_LINK; },
    });
    for (let j = 0; j < allLinks.length; j++) {
        if (allLinks[j].id === link.id) continue;
        if (room.storage && allLinks[j].pos.inRangeTo(room.storage.pos, 3)) {
            storageLink = allLinks[j];
        }
        if (room.controller && room.controller.my && allLinks[j].pos.inRangeTo(room.controller.pos, 3)) {
            controllerLink = allLinks[j];
        }
    }

    const target = controllerLink || storageLink;
    if (!target) return;
    if (target.store[RESOURCE_ENERGY] >= target.store.getCapacity(RESOURCE_ENERGY) - 10) return;

    link.transferEnergy(target);
}

module.exports = {
    run: run,
    runTower: runTower,
};
