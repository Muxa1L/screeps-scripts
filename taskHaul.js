const TaskType = require('taskBaseClass');
const taskBase = require('taskBase');
const move = require('moveUtil');
const roomManager = require('roomManager');

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

function structureHasEnergy(s) {
    if (!s || !s.store) return false;
    return (s.store[RESOURCE_ENERGY] || 0) > 0;
}

function scoreDeposit(creep, s) {
    const dist = taskBase.approxDistance(creep, s);
    const priority = DEPOSIT_PRIORITY[s.structureType] || 10;
    const free = (s.store.getCapacity(RESOURCE_ENERGY) || 0) - (s.store[RESOURCE_ENERGY] || 0);
    return priority * 1000 - free * 10 + dist;
}

function findDeposit(creep, sourceContainerId) {
    const snap = roomManager.get(creep.room.name);
    if (!snap) return null;

    const candidates = [];
    if (snap.energyStructures) {
        for (let i = 0; i < snap.energyStructures.length; i++) {
            const s = snap.energyStructures[i];
            if (s.structureType === STRUCTURE_TOWER) continue;
            if (structureNeedsEnergy(s)) candidates.push(s);
        }
    }
    if (snap.storage && structureNeedsEnergy(snap.storage)) {
        candidates.push(snap.storage);
    }
    if (snap.containers) {
        for (let i = 0; i < snap.containers.length; i++) {
            const c = snap.containers[i];
            if (c.id === sourceContainerId) continue;
            if (structureNeedsEnergy(c)) candidates.push(c);
        }
    }

    if (candidates.length === 0) return null;
    candidates.sort(function (a, b) { return scoreDeposit(creep, a) - scoreDeposit(creep, b); });
    return candidates[0];
}

function canStillDeposit(creep) {
    return creep.store[RESOURCE_ENERGY] > 0;
}

module.exports = new TaskType({
    type: 'haul',
    priority: taskBase.PRIORITY.HAUL,
    capFor: function (room, snap) {
        const rcl = (snap.controller && snap.controller.level) || 1;
        return Math.min(6, 1 + Math.floor((snap.energyStructures ? snap.energyStructures.length : 0) / 5) + Math.floor(rcl / 2));
    },
    canDo: function (creep) {
        return creep.getActiveBodyparts(CARRY) > 0;
    },
    tasks: function (room, snap) {
        const out = [];
        for (let i = 0; i < snap.containers.length; i++) {
            const c = snap.containers[i];
            if (c.store[RESOURCE_ENERGY] >= 50) out.push({ target: c });
        }
        return out;
    },
    run: function (creep, task) {
        const container = task.target;
        if (!container) return false;

        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0 ||
            (creep.store[RESOURCE_ENERGY] > 0 && (!container || !structureNeedsEnergy(container)))) {
            if (!canStillDeposit(creep)) return false;
            const deposit = findDeposit(creep, container ? container.id : null);
            if (!deposit) return false;
            move.action(creep, 'transfer@' + deposit.id);
            const tRes = creep.transfer(deposit, RESOURCE_ENERGY);
            if (tRes === ERR_NOT_IN_RANGE) {
                move.moveCreep(creep, deposit, { visualizePathStyle: { stroke: '#ffffff' } });
            } else if (tRes !== OK) {
                return false;
            }
            return canStillDeposit(creep);
        }

        if (structureHasEnergy(container)) {
            move.action(creep, 'withdraw@' + container.id);
            const wRes = creep.withdraw(container, RESOURCE_ENERGY);
            if (wRes === ERR_NOT_IN_RANGE) {
                move.moveCreep(creep, container, { visualizePathStyle: { stroke: '#ffffaa' } });
                return true;
            }
            return wRes === OK;
        }

        return false;
    },

});
