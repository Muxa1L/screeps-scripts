const taskBase = require('../taskBase');
const constants = require('../../config/constants');
const energyService = require('../../services/energyService');
const depositService = require('../../services/depositService');

const SUPPLY_CRITICAL_THRESHOLD = constants.SUPPLY_CRITICAL_THRESHOLD;
const SUPPLY_LOW_THRESHOLD = constants.SUPPLY_LOW_THRESHOLD;

function supplyPriority(snapshot) {
    if (!snapshot || !snapshot.energyStructures || snapshot.energyStructures.length === 0) {
        return taskBase.PRIORITY.UPGRADE;
    }
    let totalCapacity = 0;
    let totalEnergy = 0;
    for (let i = 0; i < snapshot.energyStructures.length; i++) {
        const s = snapshot.energyStructures[i];
        if (s.structureType === STRUCTURE_TOWER) continue;
        totalCapacity += s.store.getCapacity(RESOURCE_ENERGY) || 0;
        totalEnergy += s.store[RESOURCE_ENERGY] || 0;
    }
    if (totalCapacity === 0) return taskBase.PRIORITY.UPGRADE;
    const ratio = totalEnergy / totalCapacity;
    if (ratio < SUPPLY_CRITICAL_THRESHOLD) return 15;
    if (ratio < SUPPLY_LOW_THRESHOLD) return taskBase.PRIORITY.SUPPLY;
    return taskBase.PRIORITY.UPGRADE;
}

module.exports = {
    type: 'supply',
    priority: taskBase.PRIORITY.SUPPLY,
    requirements: { carry: 1 },
    cap: 3,
    canDo: function (creep) {
        return creep.getActiveBodyparts(CARRY) > 0;
    },
    priorityFor: supplyPriority,
    tasks: function (room, snap) {
        const out = [];
        if (!snap.energyStructures) return out;
        for (let i = 0; i < snap.energyStructures.length; i++) {
            const s = snap.energyStructures[i];
            if (s.structureType === STRUCTURE_TOWER) continue;
            if ((s.store[RESOURCE_ENERGY] || 0) < (s.store.getCapacity(RESOURCE_ENERGY) || 0)) {
                out.push({ target: s });
            }
        }
        return out;
    },
    run: function (creep, task, snap) {
        const target = task.target;
        if (!target || !target.id) return false;
        const live = Game.getObjectById(target.id);
        if (!live || live.store === undefined) return false;
        const capacity = live.store.getCapacity(RESOURCE_ENERGY) || 0;
        const energy = live.store[RESOURCE_ENERGY] || 0;
        if (energy >= capacity) return false;

        if (creep.store[RESOURCE_ENERGY] === 0) {
            if (!snap) return false;
            const source = energyService.findEnergySource(creep, snap, { allowHarvest: false });
            if (!source) return false;
            energyService.acquireEnergy(creep, source);
            return true;
        }

        return depositService.transferTo(creep, live, RESOURCE_ENERGY);
    },
};
