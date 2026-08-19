const constants = require('../config/constants');
const memory = require('../utils/memorySchema');
const taskBase = require('../tasks/taskBase');
const move = require('../utils/moveUtil');
const roomFlags = require('../utils/roomFlags');
const linkService = require('../managers/upkeep/linkService');

function structureHasEnergy(s) {
    if (!s || !s.store) return false;
    return (s.store[RESOURCE_ENERGY] || 0) > 0;
}

function scoreSource(anchor, source) {
    const energy = source.store ? (source.store[RESOURCE_ENERGY] || 0) : (source.amount || 0);
    const free = anchor.store ? (anchor.store.getFreeCapacity(RESOURCE_ENERGY) || 0) : 9999;
    const useful = Math.min(energy, free);
    const dist = taskBase.approxDistance(anchor, source);
    const reserve = source.store ? ((source.store.getCapacity(RESOURCE_ENERGY) || 0) - energy) : 0;
    return (useful + reserve * 0.05) / Math.max(1, dist);
}

function closestSafeSource(creep, snapshot) {
    if (!snapshot || !snapshot.sources || snapshot.sources.length === 0) return null;
    const safe = snapshot.sources.filter(function (s) {
        return s.energy > 0 && !taskBase.isPosNearHostile(snapshot, s.pos, 5);
    });
    if (safe.length === 0) return null;
    return creep.pos.findClosestByPath(safe);
}

function findSourceInSnapshot(id, snapshot) {
    if (!id || !snapshot) return null;
    if (snapshot.storage && snapshot.storage.id === id) return snapshot.storage;
    if (snapshot.droppedEnergy) {
        for (let i = 0; i < snapshot.droppedEnergy.length; i++) {
            if (snapshot.droppedEnergy[i].id === id) return snapshot.droppedEnergy[i];
        }
    }
    if (snapshot.containers) {
        for (let i = 0; i < snapshot.containers.length; i++) {
            if (snapshot.containers[i].id === id) return snapshot.containers[i];
        }
    }
    if (snapshot.links) {
        for (let i = 0; i < snapshot.links.length; i++) {
            if (snapshot.links[i].id === id) return snapshot.links[i];
        }
    }
    if (snapshot.sources) {
        for (let i = 0; i < snapshot.sources.length; i++) {
            if (snapshot.sources[i].id === id) return snapshot.sources[i];
        }
    }
    return null;
}

function sourceHasEnergy(source) {
    if (!source) return false;
    if (source.amount !== undefined) return source.amount > 0;
    if (source.store) return (source.store[RESOURCE_ENERGY] || 0) > 0;
    if (source.energy !== undefined) return source.energy > 0;
    return false;
}

function findEnergySource(creep, snapshot, options) {
    options = options || {};
    const role = memory.getRole(creep);

    // Harvesters harvest from sources; don't drain storage/containers.
    if (role === 'harvester') {
        return closestSafeSource(creep, snapshot);
    }

    // Sticky lock: keep refueling from the same source until it's gone/empty.
    // Without this a creep between two dropped piles re-selects each tick
    // (chebyshev distance flips as it moves) and ping-pongs without reaching
    // either. The lock is cleared by clearRefueling (when the creep fills up)
    // or here when the source is no longer valid.
    const lockedId = memory.getRefuelSource(creep);
    if (lockedId) {
        const locked = findSourceInSnapshot(lockedId, snapshot);
        if (locked && sourceHasEnergy(locked) &&
            !(options.excludeContainerId && locked.id === options.excludeContainerId)) {
            return locked;
        }
        memory.clearRefuelSource(creep);
    }

    let best = null;
    let bestScore = 0;
    // Score candidates by distance from an anchor (e.g. the controller for
    // upgraders) when provided, otherwise from the creep itself.
    const anchor = options.anchor || creep;

    function consider(source, weight) {
        const s = scoreSource(anchor, source) * weight;
        if (s > bestScore) {
            bestScore = s;
            best = source;
        }
    }

    if (snapshot.storage && snapshot.storage.store[RESOURCE_ENERGY] >= constants.STORAGE_WITHDRAW_MIN) {
        consider(snapshot.storage, 1.0);
    }

    // Dropped energy decays, so strongly prefer it over container reserves.
    if (snapshot.droppedEnergy) {
        for (let i = 0; i < snapshot.droppedEnergy.length; i++) {
            const drop = snapshot.droppedEnergy[i];
            if (drop.amount < constants.DROPPED_ENERGY_MIN) continue;
            consider(drop, 3.0);
        }
    }

    // Flagged priority containers act as local caches. Non-haulers (builders,
    // upgraders, repairers) withdraw from them; haulers deliver to them
    // instead (excluded here). The 4.0 weight puts priority containers above
    // dropped energy (3.0) and storage/ordinary containers (1.0), so a
    // `haul:`-flagged container near a workshop (e.g. controller-side cache
    // for upgraders) is the preferred refuel source, not just a tie-breaker.
    const priorityIds = roomFlags.getPriorityContainerIds(creep.pos.roomName);
    if (snapshot.containers) {
        for (let i = 0; i < snapshot.containers.length; i++) {
            const c = snapshot.containers[i];
            if (options.excludeContainerId && c.id === options.excludeContainerId) continue;
            const energy = c.store[RESOURCE_ENERGY] || 0;
            const isPriority = priorityIds[c.id];
            if (isPriority && role === 'hauler') continue;
            if (!isPriority && energy < constants.CONTAINER_WITHDRAW_MIN) continue;
            if (isPriority && energy === 0) continue;
            consider(c, isPriority ? 4.0 : 1.0);
        }
    }

    // Links (controller + storage) are withdraw sources. The controller link
    // is range <=3-4 from the controller (the upgrader's anchor), so distance
    // in scoreSource makes upgraders prefer it over everything. Supply creeps
    // drain the storage link. Weight 2.5 sits between storage (1.0) and dropped
    // energy (3.0), above ordinary containers (1.0) but below haul: containers
    // (4.0).
    if (snapshot.links) {
        const _sources = snapshot.sources || [];
        for (let i = 0; i < snapshot.links.length; i++) {
            const l = snapshot.links[i];
            // Skip source links — their energy feeds the link pipeline
            // (source → storage/controller), not direct withdrawal.
            if (linkService.isSourceLink(l, _sources)) continue;
            const energy = l.store[RESOURCE_ENERGY] || 0;
            if (energy < constants.LINK_WITHDRAW_MIN) continue;
            consider(l, 2.5);
        }
    }

    if (best) {
        memory.setRefuelSource(creep, best.id);
        return best;
    }
    if (options.allowHarvest) {
        const harvested = closestSafeSource(creep, snapshot);
        if (harvested) memory.setRefuelSource(creep, harvested.id);
        return harvested;
    }
    return null;
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
            move.moveCreep(creep, source, { visualizePathStyle: { stroke: '#ffff00' }, exactTile: true });
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
