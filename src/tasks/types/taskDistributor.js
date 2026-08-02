const taskBase = require('../taskBase');
const depositService = require('../../services/depositService');
const move = require('../../utils/moveUtil');

// Distributor: a local hauler that withdraws energy from storage and
// delivers it to spawn/extensions/towers. Unlike taskSupply (which can
// harvest from any source), the distributor only withdraws from storage,
// keeping the haul→storage→distribute pipeline clean.
module.exports = {
    type: 'distribute',
    priority: taskBase.PRIORITY.SUPPLY,
    requirements: { carry: 1 },
    cap: 3,
    canDo: function (creep) {
        return creep.getActiveBodyparts(CARRY) > 0;
    },
    tasks: function (room, snap) {
        // No storage or storage is empty — nothing to distribute.
        if (!snap.storage || (snap.storage.store[RESOURCE_ENERGY] || 0) < 50) return [];
        const out = [];
        if (snap.energyStructures) {
            for (let i = 0; i < snap.energyStructures.length; i++) {
                const s = snap.energyStructures[i];
                const capacity = s.store.getCapacity(RESOURCE_ENERGY) || 0;
                const energy = s.store[RESOURCE_ENERGY] || 0;
                if (energy >= capacity) continue;
                // Skip a spawn with a tiny fill (under 50) when extensions
                // are also available — same logic as taskSupply.
                if (s.structureType === STRUCTURE_SPAWN && energy < 50 && capacity >= 50) continue;
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

        const creepEnergy = creep.store[RESOURCE_ENERGY] || 0;

        // Refuel phase: withdraw from storage only.
        if (creepEnergy === 0) {
            if (!snap || !snap.storage) return false;
            const storageEnergy = snap.storage.store[RESOURCE_ENERGY] || 0;
            if (storageEnergy < 50) return false;
            const storage = Game.getObjectById(snap.storage.id);
            if (!storage) return false;
            move.action(creep, 'withdraw@storage');
            const wRes = creep.withdraw(storage, RESOURCE_ENERGY);
            if (wRes === ERR_NOT_IN_RANGE) {
                move.moveCreep(creep, storage, { visualizePathStyle: { stroke: '#aaffaa' } });
                return true;
            }
            return wRes === OK;
        }

        // Delivery phase: transfer to the target structure.
        const hadEnergy = creepEnergy;
        const stillCarrying = depositService.transferTo(creep, live, RESOURCE_ENERGY);
        if (hadEnergy > 0 && !stillCarrying) return false;
        return true;
    },
};