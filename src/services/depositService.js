const taskBase = require('../tasks/taskBase');
const move = require('../utils/moveUtil');
const roomFlags = require('../utils/roomFlags');
const linkService = require('../managers/upkeep/linkService');

const DEPOSIT_PRIORITY = {
    [STRUCTURE_SPAWN]: 1,
    [STRUCTURE_EXTENSION]: 2,
    [STRUCTURE_TOWER]: 3,
    [STRUCTURE_STORAGE]: 4,
    [STRUCTURE_CONTAINER]: 5,
    [STRUCTURE_LINK]: 6,
};

function structureNeedsEnergy(s) {
    if (!s || !s.store) return false;
    const energy = s.store[RESOURCE_ENERGY] || 0;
    return energy < s.store.getCapacity(RESOURCE_ENERGY);
}

function scoreDeposit(creep, s, priorityIds) {
    const dist = taskBase.approxDistance(creep, s);
    const priority = DEPOSIT_PRIORITY[s.structureType] || 10;
    const cap = s.store.getCapacity(RESOURCE_ENERGY) || 1;
    const free = cap - (s.store[RESOURCE_ENERGY] || 0);
    const freeRatio = free > 0 ? Math.min(1, free / cap) : 0;
    let score = priority * 1000 - Math.round(freeRatio * 400) + dist;
    if (priorityIds && priorityIds[s.id]) score -= 500;
    return score;
}

function findDeposit(creep, snapshot, options) {
    options = options || {};
    const resourceType = options.resourceType || RESOURCE_ENERGY;
    const excludeId = options.excludeId || null;
    const excludeTypes = options.excludeTypes || {};

    if (resourceType === RESOURCE_ENERGY) {
        const candidates = [];
        const priorityIds = roomFlags.getPriorityContainerIds(creep.pos.roomName);
        // Use snapshot objects directly — roomManager.snapshotFor stores live
        // structure references from room.find, valid for the whole tick. The
        // per-candidate Game.getObjectById re-fetches were redundant;
        // transferTo re-validates the final selection via getObjectById.
        if (snapshot.energyStructures) {
            for (let i = 0; i < snapshot.energyStructures.length; i++) {
                const s = snapshot.energyStructures[i];
                if (excludeTypes[s.structureType]) continue;
                if (!structureNeedsEnergy(s)) continue;
                candidates.push(s);
            }
        }
        if (snapshot.storage && !excludeTypes[STRUCTURE_STORAGE]) {
            if (structureNeedsEnergy(snapshot.storage)) candidates.push(snapshot.storage);
        }
        if (snapshot.containers) {
            for (let i = 0; i < snapshot.containers.length; i++) {
                const c = snapshot.containers[i];
                if (excludeId && c.id === excludeId) continue;
                if (excludeTypes[STRUCTURE_CONTAINER]) continue;
                if (!structureNeedsEnergy(c)) continue;
                candidates.push(c);
            }
        }
        // Source links are a last-resort deposit (tier 6, below containers).
        // Only source links qualify — controller/storage links are filled by
        // the link-to-link transfer in linkService, not by haulers. Filling a
        // source link beams the energy to the controller/storage link next
        // tick, keeping the hauler loop moving when the room is saturated.
        if (snapshot.links) {
            const sources = snapshot.sources || [];
            for (let i = 0; i < snapshot.links.length; i++) {
                const l = snapshot.links[i];
                if (excludeTypes[STRUCTURE_LINK]) continue;
                if (!structureNeedsEnergy(l)) continue;
                if (!linkService.isSourceLink(l, sources)) continue;
                candidates.push(l);
            }
        }
        if (candidates.length === 0) return null;
        candidates.sort(function (a, b) { return scoreDeposit(creep, a, priorityIds) - scoreDeposit(creep, b, priorityIds); });
        return candidates[0];
    }

    if (snapshot.storage && snapshot.storage.store.getFreeCapacity(resourceType) > 0) {
        return snapshot.storage;
    }
    return null;
}

function transferTo(creep, target, resourceType) {
    resourceType = resourceType || RESOURCE_ENERGY;
    if (!target) return false;
    const live = Game.getObjectById(target.id);
    if (!live || !live.store || live.store.getFreeCapacity(resourceType) <= 0) return false;
    move.action(creep, 'transfer@' + live.id);
    const res = creep.transfer(live, resourceType);
    if (res === ERR_NOT_IN_RANGE) {
        move.moveCreep(creep, live, { visualizePathStyle: { stroke: '#ffffff' } });
        return true;
    }
    return res === OK && (creep.store[resourceType] || 0) > 0;
}

module.exports = {
    DEPOSIT_PRIORITY: DEPOSIT_PRIORITY,
    structureNeedsEnergy: structureNeedsEnergy,
    findDeposit: findDeposit,
    transferTo: transferTo,
};
