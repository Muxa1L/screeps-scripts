const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');
const memory = require('../../utils/memorySchema');
const depositService = require('../../services/depositService');
const roomFlags = require('../../utils/roomFlags');

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
        const priorityIds = roomFlags.getPriorityContainerIds(room.name);
        for (let i = 0; i < snap.containers.length; i++) {
            const c = snap.containers[i];
            if (priorityIds[c.id]) continue; // flagged containers are caches, not haul sources
            if (c.store[RESOURCE_ENERGY] >= 20) out.push({ target: c });
        }
        return out;
    },
    score: function (creep, target) {
        const dist = taskBase.approxDistance(creep, target);
        const energy = target.store ? (target.store[RESOURCE_ENERGY] || 0) : 0;
        // Prefer fuller containers over closer nearly-empty ones, but cap the
        // energy bonus so distance still matters for extremely far sources.
        return dist - Math.min(energy / 25, 20);
    },
    run: function (creep, task, snap) {
        const container = task.target ? Game.getObjectById(task.target.id) : null;
        if (!container || !container.store) return false;

        const energy = creep.store[RESOURCE_ENERGY] || 0;
        const freeCapacity = creep.store.getFreeCapacity(RESOURCE_ENERGY) || 0;
        const hauledFrom = memory.getHauledFrom(creep);

        if (energy === 0) {
            memory.clearHauledFrom(creep);
        }

        // Delivery phase: we have energy (or are full) and a deposit exists.
        // Always exclude the source container so we don't dump back into it.
        if (energy > 0 && (freeCapacity === 0 || !depositService.structureNeedsEnergy(container) || hauledFrom === container.id)) {
            const deposit = depositService.findDeposit(creep, snap, {
                excludeId: container.id,
                excludeTypes: { [STRUCTURE_TOWER]: true },
            });
            if (!deposit) {
                // No deposit available; keep hauling this container rather than
                // flipping to a different source every tick.
                return true;
            }
            const hadEnergy = energy;
            const stillCarrying = depositService.transferTo(creep, deposit, RESOURCE_ENERGY);
            // Release the haul task once we have attempted delivery and no longer
            // have a full load. This prevents endless withdraw/deposit loops on
            // the same container.
            if (hadEnergy > 0 && !stillCarrying) return false;
            return true;
        }

        // Collection phase: withdraw from the source container.
        if (depositService.structureNeedsEnergy(container)) {
            move.action(creep, 'withdraw@' + container.id);
            const wRes = creep.withdraw(container, RESOURCE_ENERGY);
            if (wRes === ERR_NOT_IN_RANGE) {
                move.moveCreep(creep, container, { visualizePathStyle: { stroke: '#ffffaa' } });
                return true;
            }
            if (wRes === OK) memory.setHauledFrom(creep, container.id);
            // After a successful withdraw, keep the task so the next tick delivers.
            return wRes === OK;
        }

        return false;
    },
};
