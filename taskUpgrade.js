const TaskType = require('taskBaseClass');
const taskBase = require('taskBase');
const move = require('moveUtil');
const roomManager = require('roomManager');

const UPGRADE_CRITICAL_THRESHOLD = 3000;
const UPGRADE_URGENT_THRESHOLD = 1500;
const UPGRADE_EMERGENCY_THRESHOLD = 500;
const STORAGE_WITHDRAW_MIN = 200;
const CONTAINER_WITHDRAW_MIN = 50;

function findEnergySource(creep) {
    const snap = roomManager.get(creep.room.name);
    if (!snap) return null;

    if (snap.storage && snap.storage.store[RESOURCE_ENERGY] >= STORAGE_WITHDRAW_MIN) {
        return snap.storage;
    }
    if (snap.containers) {
        let best = null;
        let bestEnergy = 0;
        for (let i = 0; i < snap.containers.length; i++) {
            const c = snap.containers[i];
            const energy = c.store[RESOURCE_ENERGY] || 0;
            if (energy >= CONTAINER_WITHDRAW_MIN && energy > bestEnergy) {
                bestEnergy = energy;
                best = c;
            }
        }
        if (best) return best;
    }
    if (snap.sources && snap.sources.length > 0) {
        return creep.pos.findClosestByPath(snap.sources);
    }
    return null;
}

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

module.exports = new TaskType({
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
    run: function (creep, task) {
        const controller = task.target;
        if (!controller) return false;
        const capacity = creep.store.getCapacity(RESOURCE_ENERGY) || 0;
        const energy = creep.store[RESOURCE_ENERGY] || 0;
        if (energy < capacity) {
            const source = findEnergySource(creep);
            if (source) {
                if (source.structureType) {
                    move.action(creep, 'withdraw@' + source.id);
                    const wres = creep.withdraw(source, RESOURCE_ENERGY);
                    if (wres === ERR_NOT_IN_RANGE) {
                        move.moveCreep(creep, source, { visualizePathStyle: { stroke: '#ffffaa' } });
                    }
                } else {
                    move.action(creep, 'harvest@' + source.id);
                    const hres = creep.harvest(source);
                    if (hres === ERR_NOT_IN_RANGE) {
                        move.moveCreep(creep, source, { visualizePathStyle: { stroke: '#ffaa00' } });
                    }
                }
                return true;
            }
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
});

