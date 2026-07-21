const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');
const constants = require('../../config/constants');
const memory = require('../../utils/memorySchema');
const energyService = require('../../services/energyService');

const UPGRADE_CRITICAL_THRESHOLD = constants.UPGRADE_CRITICAL_THRESHOLD;
const UPGRADE_URGENT_THRESHOLD = constants.UPGRADE_URGENT_THRESHOLD;
const UPGRADE_EMERGENCY_THRESHOLD = constants.UPGRADE_EMERGENCY_THRESHOLD;

function upgradePriority(snapshot) {
    if (!snapshot || !snapshot.controller) return taskBase.PRIORITY.UPGRADE;
    const c = snapshot.controller;
    const ttd = c.ticksToDowngrade;
    if (ttd === undefined || ttd === null) return taskBase.PRIORITY.UPGRADE;
    if (ttd < UPGRADE_EMERGENCY_THRESHOLD) return taskBase.PRIORITY.DEFEND;
    if (ttd < UPGRADE_URGENT_THRESHOLD) return taskBase.PRIORITY.RENEW;
    if (ttd < UPGRADE_CRITICAL_THRESHOLD) return taskBase.PRIORITY.SUPPLY;
    return taskBase.PRIORITY.UPGRADE;
}

module.exports = {
    type: 'upgrade',
    priority: taskBase.PRIORITY.UPGRADE,
    capFor: function (room, snap) {
        if (!snap || !snap.controller) return 4;
        const ttd = snap.controller.ticksToDowngrade;
        if (typeof ttd !== 'number') return 4;
        if (ttd < UPGRADE_EMERGENCY_THRESHOLD) return 12;
        if (ttd < UPGRADE_URGENT_THRESHOLD) return 8;
        if (ttd < UPGRADE_CRITICAL_THRESHOLD) return 6;
        return 4;
    },
    requirements: { work: 1, carry: 1 },
    canDo: function (creep) {
        return creep.getActiveBodyparts(WORK) > 0 && creep.getActiveBodyparts(CARRY) > 0;
    },
    priorityFor: upgradePriority,
    tasks: function (room, _snap) {
        if (room.controller && room.controller.my) {
            return [{ target: room.controller }];
        }
        return [];
    },
    run: function (creep, task, snap) {
        const controller = task.target;
        if (!controller || !controller.id) return false;
        const live = Game.getObjectById(controller.id);
        if (!live || !live.my) return false;
        const capacity = creep.store.getCapacity(RESOURCE_ENERGY) || 0;
        const energy = creep.store[RESOURCE_ENERGY] || 0;
        const workParts = creep.getActiveBodyparts(WORK);
        const minEnergy = Math.max(1, workParts * UPGRADE_CONTROLLER_POWER);
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
        const res = creep.upgradeController(controller);
        if (res === ERR_NOT_IN_RANGE) {
            move.action(creep, 'moving->upgrade');
            move.moveCreep(creep, controller, { visualizePathStyle: { stroke: '#ffffff' } });
            return true;
        }
        move.action(creep, 'upgrading');
        return true;
    },
};
