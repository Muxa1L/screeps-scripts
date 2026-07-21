const constants = require('../config/constants');
const memory = require('../utils/memorySchema');
const taskBase = require('../tasks/taskBase');
const move = require('../utils/moveUtil');

function structureHasEnergy(s) {
    if (!s || !s.store) return false;
    return (s.store[RESOURCE_ENERGY] || 0) > 0;
}

function scoreSource(creep, source) {
    const energy = source.store ? (source.store[RESOURCE_ENERGY] || 0) : (source.amount || 0);
    const free = creep.store.getFreeCapacity(RESOURCE_ENERGY);
    const useful = Math.min(energy, free);
    const dist = taskBase.approxDistance(creep, source);
    return useful / Math.max(1, dist);
}

function closestSafeSource(creep, snapshot) {
    if (!snapshot || !snapshot.sources || snapshot.sources.length === 0) return null;
    const safe = snapshot.sources.filter(function (s) {
        return !taskBase.isPosNearHostile(snapshot, s.pos, 5);
    });
    if (safe.length === 0) return null;
    return creep.pos.findClosestByPath(safe);
}

function findEnergySource(creep, snapshot, options) {
    options = options || {};
    const role = memory.getRole(creep);

    // Harvesters harvest from sources; don't drain storage/containers.
    if (role === 'harvester') {
        return closestSafeSource(creep, snapshot);
    }

    let best = null;
    let bestScore = 0;

    if (snapshot.storage && snapshot.storage.store[RESOURCE_ENERGY] >= constants.STORAGE_WITHDRAW_MIN) {
        best = snapshot.storage;
        bestScore = scoreSource(creep, snapshot.storage);
    }

    if (snapshot.containers) {
        for (let i = 0; i < snapshot.containers.length; i++) {
            const c = snapshot.containers[i];
            if (options.excludeContainerId && c.id === options.excludeContainerId) continue;
            const energy = c.store[RESOURCE_ENERGY] || 0;
            if (energy < constants.CONTAINER_WITHDRAW_MIN) continue;
            const s = scoreSource(creep, c);
            if (s > bestScore) {
                bestScore = s;
                best = c;
            }
        }
    }

    if (snapshot.droppedEnergy) {
        for (let i = 0; i < snapshot.droppedEnergy.length; i++) {
            const drop = snapshot.droppedEnergy[i];
            if (drop.amount < constants.DROPPED_ENERGY_MIN) continue;
            const s = scoreSource(creep, drop);
            if (s > bestScore) {
                bestScore = s;
                best = drop;
            }
        }
    }

    if (!best && options.allowHarvest) {
        return closestSafeSource(creep, snapshot);
    }

    return best;
}

function acquireEnergy(creep, source) {
    if (!source) return ERR_INVALID_TARGET;
    if (source.store) {
        move.action(creep, 'withdraw@' + source.id);
        const res = creep.withdraw(source, RESOURCE_ENERGY);
        if (res === ERR_NOT_IN_RANGE) {
            move.moveCreep(creep, source, { visualizePathStyle: { stroke: '#ffffaa' } });
        }
        return res;
    }
    if (source.amount !== undefined) {
        move.action(creep, 'pickup@' + source.id);
        const res = creep.pickup(source);
        if (res === ERR_NOT_IN_RANGE) {
            move.moveCreep(creep, source, { visualizePathStyle: { stroke: '#ffff00' } });
        }
        return res;
    }
    move.action(creep, 'harvest@' + source.id);
    const res = creep.harvest(source);
    if (res === ERR_NOT_IN_RANGE) {
        move.moveCreep(creep, source, { visualizePathStyle: { stroke: '#ffaa00' } });
    }
    return res;
}

module.exports = {
    structureHasEnergy: structureHasEnergy,
    scoreSource: scoreSource,
    findEnergySource: findEnergySource,
    acquireEnergy: acquireEnergy,
};
