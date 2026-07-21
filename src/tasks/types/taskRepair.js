const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');
const memory = require('../../utils/memorySchema');
const energyService = require('../../services/energyService');

module.exports = {
    type: 'repair',
    priority: taskBase.PRIORITY.REPAIR,
    cap: 2,
    requirements: { work: 1, carry: 1 },
    canDo: function (creep) {
        return creep.getActiveBodyparts(WORK) > 0 && creep.getActiveBodyparts(CARRY) > 0;
    },
    tasks: function (room, snap) {
        const out = [];
        for (let i = 0; i < snap.damagedCritical.length; i++) {
            out.push({ target: snap.damagedCritical[i] });
        }
        for (let j = 0; j < snap.damagedNonCritical.length; j++) {
            out.push({ target: snap.damagedNonCritical[j] });
        }
        return out;
    },
    run: function (creep, task, snap) {
        const target = task.target;
        if (!target) return false;
        const live = Game.getObjectById(target.id);
        if (!live || live.hits === undefined) return false;
        if (live.hits >= live.hitsMax) return false;
        const capacity = creep.store.getCapacity(RESOURCE_ENERGY) || 0;
        const energy = creep.store[RESOURCE_ENERGY] || 0;
        const workParts = creep.getActiveBodyparts(WORK);
        const minEnergy = Math.max(1, workParts);
        const isFull = energy >= capacity;
        if (isFull || energy >= minEnergy) memory.clearRefueling(creep);
        if (memory.getRefueling(creep) || energy < minEnergy) {
            if (!isFull) {
                const source = energyService.findEnergySource(creep, snap, { allowHarvest: true });
                if (source) {
                    memory.setRefueling(creep, true);
                    energyService.acquireEnergy(creep, source);
                    return true;
                }
            }
            memory.clearRefueling(creep);
            if (energy < minEnergy) return false;
        }
        const res = creep.repair(live);
        if (res === ERR_NOT_IN_RANGE) {
            move.action(creep, 'moving->repair@' + live.id);
            move.moveCreep(creep, live, { visualizePathStyle: { stroke: '#aaaaff' } });
            return true;
        }
        move.action(creep, 'repairing@' + live.id);
        if (res === OK && live.hitsMax - live.hits <= workParts * REPAIR_POWER) {
            return false;
        }
        return true;
    },
};
