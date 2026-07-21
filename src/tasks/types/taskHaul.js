const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');
const memory = require('../../utils/memorySchema');
const depositService = require('../../services/depositService');

function canStillDeposit(creep) {
    return creep.store[RESOURCE_ENERGY] > 0;
}

module.exports = {
    type: 'haul',
    priority: taskBase.PRIORITY.HAUL,
    requirements: { carry: 1 },
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
    run: function (creep, task, snap) {
        const container = task.target;
        if (!container) return false;

        if (creep.store[RESOURCE_ENERGY] === 0) {
            memory.clearHauledFrom(creep);
        }

        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0 ||
            (creep.store[RESOURCE_ENERGY] > 0 && (!container || !depositService.structureNeedsEnergy(container)))) {
            if (!canStillDeposit(creep)) return false;
            const excludeId = (memory.getHauledFrom(creep) === container.id) ? container.id : null;
            const deposit = depositService.findDeposit(creep, snap, {
                excludeId: excludeId,
                excludeTypes: { [STRUCTURE_TOWER]: true },
            });
            if (!deposit) return false;
            return depositService.transferTo(creep, deposit, RESOURCE_ENERGY);
        }

        if (depositService.structureNeedsEnergy(container)) {
            move.action(creep, 'withdraw@' + container.id);
            const wRes = creep.withdraw(container, RESOURCE_ENERGY);
            if (wRes === ERR_NOT_IN_RANGE) {
                move.moveCreep(creep, container, { visualizePathStyle: { stroke: '#ffffaa' } });
                return true;
            }
            if (wRes === OK) memory.setHauledFrom(creep, container.id);
            return wRes === OK;
        }

        return false;
    },
};
