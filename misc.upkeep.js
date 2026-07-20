var RAMPART_TARGET_HITS = 100000;
var SAFE_MODE_TRIGGER_HITS = 5000;

function run() {
    var spawn = Game.spawns['Spawn1'];
    if (!spawn) return;

    for (var name in Game.structures) {
        var s = Game.structures[name];
        if (!s.structureType) continue;
        if (s.structureType === STRUCTURE_TOWER) {
            runTower(s);
        }
    }

    if (spawn.hits < SAFE_MODE_TRIGGER_HITS && spawn.my && spawn.room && spawn.room.controller) {
        if (spawn.room.controller.safeModeAvailable > 0 && !spawn.room.controller.safeMode) {
            var res = spawn.room.controller.activateSafeMode();
            if (Game.time % 100 === 0) console.log('safe mode activate: ' + res);
        }
    }

    for (var cname in Memory.creeps) {
        if (!Game.creeps[cname]) {
            delete Memory.creeps[cname];
            if (Memory.sources) {
                for (var sid in Memory.sources) {
                    var slots = Memory.sources[sid].slots;
                    for (var si = 0; si < slots.length; si++) {
                        if (slots[si].claimedBy === cname) slots[si].claimedBy = null;
                    }
                }
            }
        }
    }
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
};
