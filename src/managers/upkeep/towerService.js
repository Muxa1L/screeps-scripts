const constants = require('../../config/constants');
const roomManager = require('../roomManager');

const RAMPART_TARGET_HITS = constants.RAMPART_TARGET_HITS;
const TOWER_MIN_ATTACK_ENERGY = constants.TOWER_MIN_ATTACK_ENERGY;
const TOWER_MIN_HEAL_ENERGY = constants.TOWER_MIN_HEAL_ENERGY;
const TOWER_MIN_REPAIR_ENERGY = constants.TOWER_MIN_REPAIR_ENERGY;

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
    if (snap && snap.hostiles.length > 0) {
        closestHostile = closestByRangeFrom(tower.pos, snap.hostiles);
    } else {
        closestHostile = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    }
    if (closestHostile && energy >= TOWER_MIN_ATTACK_ENERGY) {
        tower.attack(closestHostile);
        return;
    }
    if (energy >= TOWER_MIN_HEAL_ENERGY) {
        let closestDamagedCreep = null;
        if (snap && snap.damagedFriendlies.length > 0) {
            closestDamagedCreep = closestByRangeFrom(tower.pos, snap.damagedFriendlies);
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

module.exports = {
    runTower: runTower,
};
