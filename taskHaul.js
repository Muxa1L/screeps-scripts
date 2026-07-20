var TaskType = require('taskBaseClass');
var taskBase = require('taskBase');
var move = require('moveUtil');
var roomManager = require('roomManager');

function findDeposit(creep, sourceContainerId) {
    var snap = roomManager.get(creep.room.name);
    if (snap && snap.energyStructures && snap.energyStructures.length > 0) {
        var nearest = creep.pos.findClosestByPath(snap.energyStructures);
        if (nearest) return nearest;
    }
    if (creep.room.storage && _.sum(creep.room.storage.store) < creep.room.storage.storeCapacity) {
        return creep.room.storage;
    }
    var containers = creep.room.find(FIND_STRUCTURES, {
        filter: function (s) {
            return s.structureType === STRUCTURE_CONTAINER &&
                   s.id !== sourceContainerId &&
                   _.sum(s.store) < s.storeCapacity;
        },
    });
    if (containers.length > 0) {
        return creep.pos.findClosestByPath(containers);
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
        var out = [];
        for (var i = 0; i < snap.containers.length; i++) {
            var c = snap.containers[i];
            if (c.store[RESOURCE_ENERGY] >= 50) out.push({ target: c });
        }
        return out;
    },
    run: function (creep, task) {
        var container = task.target;
        if (!container) return false;
        if (creep.carry.energy >= creep.carryCapacity) {
            var deposit = findDeposit(creep, container.id);
            if (!deposit) return false;
            move.action(creep, 'transfer@' + deposit.id);
            if (creep.transfer(deposit, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                move.moveCreep(creep, deposit, { visualizePathStyle: { stroke: '#ffffff' } });
            }
            return true;
        }
        if (creep.carry.energy > 0) {
            var deposit2 = findDeposit(creep, container.id);
            if (deposit2) {
                move.action(creep, 'transfer@' + deposit2.id);
                if (creep.transfer(deposit2, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    move.moveCreep(creep, deposit2, { visualizePathStyle: { stroke: '#ffffff' } });
                }
                return true;
            }
        }
        move.action(creep, 'withdraw@' + container.id);
        if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            move.moveCreep(creep, container, { visualizePathStyle: { stroke: '#ffffaa' } });
        }
        return true;
    },
});
