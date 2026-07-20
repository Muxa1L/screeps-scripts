const TaskType = require('taskBaseClass');
const taskBase = require('taskBase');
const move = require('moveUtil');
const roomManager = require('roomManager');

function findDeposit(creep, sourceContainerId) {
    const snap = roomManager.get(creep.room.name);
    if (snap && snap.energyStructures && snap.energyStructures.length > 0) {
        const nearest = creep.pos.findClosestByPath(snap.energyStructures);
        if (nearest) return nearest;
    }
    if (snap && snap.storage && _.sum(snap.storage.store) < snap.storage.store.getCapacity()) {
        return snap.storage;
    }
    if (snap && snap.containers) {
        const usable = [];
        for (let i = 0; i < snap.containers.length; i++) {
            const c = snap.containers[i];
            if (c.id !== sourceContainerId && _.sum(c.store) < c.store.getCapacity()) {
                usable.push(c);
            }
        }
        if (usable.length > 0) {
            return creep.pos.findClosestByPath(usable);
        }
    }
    return null;
}

module.exports = new TaskType({
    type: 'haul',
    priority: taskBase.PRIORITY.HAUL,
    cap: 2,
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
        if (creep.store[RESOURCE_ENERGY] >= creep.store.getCapacity()) {
            const deposit = findDeposit(creep, container.id);
            if (!deposit) return false;
            move.action(creep, 'transfer@' + deposit.id);
            if (creep.transfer(deposit, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                move.moveCreep(creep, deposit, { visualizePathStyle: { stroke: '#ffffff' } });
            }
            return true;
        }
        const containerEnergy = container.store[RESOURCE_ENERGY] || 0;
        if (containerEnergy > 0 && creep.store[RESOURCE_ENERGY] < creep.store.getCapacity()) {
            move.action(creep, 'withdraw@' + container.id);
            if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                move.moveCreep(creep, container, { visualizePathStyle: { stroke: '#ffffaa' } });
            }
            return true;
        }
        if (creep.store[RESOURCE_ENERGY] > 0) {
            const deposit2 = findDeposit(creep, container.id);
            if (deposit2) {
                move.action(creep, 'transfer@' + deposit2.id);
                if (creep.transfer(deposit2, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    move.moveCreep(creep, deposit2, { visualizePathStyle: { stroke: '#ffffff' } });
                }
                return true;
            }
        }
        return false;
    },
});
