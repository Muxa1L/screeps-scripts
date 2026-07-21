const taskBase = require('../tasks/taskBase');
const move = require('../utils/moveUtil');
const roomFlags = require('../utils/roomFlags');

const DEPOSIT_PRIORITY = {
    [STRUCTURE_SPAWN]: 1,
    [STRUCTURE_EXTENSION]: 2,
    [STRUCTURE_TOWER]: 3,
    [STRUCTURE_STORAGE]: 4,
    [STRUCTURE_CONTAINER]: 5,
};

function structureNeedsEnergy(s) {
    if (!s || !s.store) return false;
    const energy = s.store[RESOURCE_ENERGY] || 0;
    return energy < s.store.getCapacity(RESOURCE_ENERGY);
}

function scoreDeposit(creep, s, priorityIds) {
    const dist = taskBase.approxDistance(creep, s);
    const priority = DEPOSIT_PRIORITY[s.structureType] || 10;
    const free = (s.store.getCapacity(RESOURCE_ENERGY) || 0) - (s.store[RESOURCE_ENERGY] || 0);
    let score = priority * 1000 - free * 10 + dist;
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
        if (snapshot.energyStructures) {
            for (let i = 0; i < snapshot.energyStructures.length; i++) {
                const s = snapshot.energyStructures[i];
                if (excludeTypes[s.structureType]) continue;
                const live = Game.getObjectById(s.id);
                if (!live || !structureNeedsEnergy(live)) continue;
                candidates.push(live);
            }
        }
        if (snapshot.storage && !excludeTypes[STRUCTURE_STORAGE]) {
            const liveStorage = Game.getObjectById(snapshot.storage.id);
            if (liveStorage && structureNeedsEnergy(liveStorage)) candidates.push(liveStorage);
        }
        if (snapshot.containers) {
            for (let i = 0; i < snapshot.containers.length; i++) {
                const c = snapshot.containers[i];
                if (excludeId && c.id === excludeId) continue;
                if (excludeTypes[STRUCTURE_CONTAINER]) continue;
                const live = Game.getObjectById(c.id);
                if (!live || !structureNeedsEnergy(live)) continue;
                candidates.push(live);
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
