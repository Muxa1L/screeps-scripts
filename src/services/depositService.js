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
        // Build a set of source-adjacent container IDs so haulers never deposit
        // into containers that sit next to sources — those are haul sources,
        // not deposit targets. A container within range 2 of any source is
        // considered a source container.
        const sourceContainerIds = {};
        if (snapshot.sources && snapshot.containers) {
            for (let s = 0; s < snapshot.sources.length; s++) {
                const src = snapshot.sources[s];
                for (let c = 0; c < snapshot.containers.length; c++) {
                    const con = snapshot.containers[c];
                    if (src.pos && con.pos && src.pos.roomName === con.pos.roomName &&
                        Math.abs(src.pos.x - con.pos.x) <= 2 && Math.abs(src.pos.y - con.pos.y) <= 2) {
                        sourceContainerIds[con.id] = true;
                    }
                }
            }
        }
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
                if (sourceContainerIds[c.id]) continue; // don't deposit into source containers
                if (!structureNeedsEnergy(c)) continue;
                candidates.push(c);
            }
        }
        // Source links are a last-resort deposit (below containers): when
        // spawns/extensions/towers/storage/containers are all full, dumping
        // into a source link beams the energy to the storage link instead of
        // letting it sit in the hauler. Only source links qualify. Callers
        // can still opt out via excludeTypes[STRUCTURE_LINK].
        if (snapshot.links && !excludeTypes[STRUCTURE_LINK]) {
            for (let i = 0; i < snapshot.links.length; i++) {
                const l = snapshot.links[i];
                if (!structureNeedsEnergy(l)) continue;
                if (!linkService.isSourceLink(l, snapshot.sources || [])) continue;
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
    // Return true if the creep is still carrying any of this resource after
    // the transfer attempt. ERR_FULL / OK-with-remaining both mean "still
    // carrying" — caller should re-pick a target. Only OK with empty store
    // (stillCarrying=false) signals the task can be released.
    if (res === OK || res === ERR_FULL) {
        return (creep.store[resourceType] || 0) > 0;
    }
    return false;
}

module.exports = {
    DEPOSIT_PRIORITY: DEPOSIT_PRIORITY,
    structureNeedsEnergy: structureNeedsEnergy,
    findDeposit: findDeposit,
    transferTo: transferTo,
};
