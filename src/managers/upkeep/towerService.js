const constants = require('../../config/constants');
const roomManager = require('../roomManager');

const rampartTargetFor = constants.rampartTargetFor;
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

// Threat tiers for hostile targeting: lower tier = higher priority.
// Healers sustain the attack and must be removed first; ranged attackers
// apply pressure from distance; melee attackers must close to threaten;
// creeps with no combat parts (scouts) are lowest priority. Distance is
// the tiebreaker within a tier.
function hostileThreatTier(hostile) {
    if (hostile.getActiveBodyparts(HEAL) > 0) return 0;
    if (hostile.getActiveBodyparts(RANGED_ATTACK) > 0) return 1;
    if (hostile.getActiveBodyparts(ATTACK) > 0) return 2;
    return 3;
}

function pickHostileTarget(towerPos, hostiles) {
    let best = null;
    let bestTier = Infinity;
    let bestRange = Infinity;
    for (let i = 0; i < hostiles.length; i++) {
        const h = hostiles[i];
        const tier = hostileThreatTier(h);
        const range = towerPos.getRangeTo(h);
        if (tier < bestTier || (tier === bestTier && range < bestRange)) {
            best = h;
            bestTier = tier;
            bestRange = range;
        }
    }
    return best;
}

function runTower(tower) {
    const energy = tower.energy;
    const snap = roomManager.get(tower.room.name);
    let closestHostile = null;
    if (snap && snap.hostiles.length > 0) {
        closestHostile = pickHostileTarget(tower.pos, snap.hostiles);
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
        let damaged = null;
        if (snap && snap.repairTargets && snap.repairTargets.length > 0) {
            // Towers should not waste energy repairing roads — leave that to
            // creep repairers. Filter roads out of the snapshot list.
            const nonRoad = [];
            for (let i = 0; i < snap.repairTargets.length; i++) {
                if (snap.repairTargets[i].structureType !== STRUCTURE_ROAD) {
                    nonRoad.push(snap.repairTargets[i]);
                }
            }
            damaged = closestByRangeFrom(tower.pos, nonRoad);
        } else {
            // Defensive fallback (snap null in unowned rooms — shouldn't
            // happen for an owned tower, but keeps the function safe).
            const rampartTarget = rampartTargetFor(tower.room.controller ? tower.room.controller.level : 0);
            damaged = tower.pos.findClosestByRange(FIND_STRUCTURES, {
                filter: function (s) {
                    if (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) {
                        return s.hits < rampartTarget;
                    }
                    if (s.hits >= s.hitsMax) return false;
                    return s.structureType === STRUCTURE_CONTAINER ||
                           s.structureType === STRUCTURE_SPAWN ||
                           s.structureType === STRUCTURE_EXTENSION;
                },
            });
        }
        if (damaged) {
            tower.repair(damaged);
        }
    }
}

module.exports = {
    runTower: runTower,
    pickHostileTarget: pickHostileTarget,
    hostileThreatTier: hostileThreatTier,
};
