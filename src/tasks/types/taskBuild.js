const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');
const memory = require('../../utils/memorySchema');
const energyService = require('../../services/energyService');

module.exports = {
    type: 'build',
    priority: taskBase.PRIORITY.BUILD,
    cap: 2,
    requirements: { work: 1, carry: 1 },
    canDo: function (creep) {
        return creep.getActiveBodyparts(WORK) > 0 && creep.getActiveBodyparts(CARRY) > 0;
    },
    tasks: function (room, snap) {
        return snap.constructionSites.map(function (s) { return { target: s }; });
    },
    score: function (creep, target) {
        return taskBase.pathScore(creep, target);
    },
    run: function (creep, task, snap) {
        const site = task.target;
        if (!site || !site.id) return false;
        const live = Game.getObjectById(site.id);
        if (!live || live.progress === undefined) return false;
        if (live.progress >= live.progressTotal) return false;
        const capacity = creep.store.getCapacity(RESOURCE_ENERGY) || 0;
        const energy = creep.store[RESOURCE_ENERGY] || 0;
        const workParts = creep.getActiveBodyparts(WORK);
        const minEnergy = workParts * BUILD_POWER;
        const isFull = energy >= capacity;
        if (isFull) memory.clearRefueling(creep);
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
            if (energy === 0) return false;
        }
        const res = creep.build(live);
        if (res === ERR_NOT_IN_RANGE) {
            move.action(creep, 'moving->build@' + live.id);
            move.moveCreep(creep, live, { visualizePathStyle: { stroke: '#ffffff' } });
            return true;
        }
        move.action(creep, 'building@' + live.id);
        if (res === OK && live.progressTotal - live.progress <= workParts * BUILD_POWER) {
            return false;
        }
        return true;
    },
};
