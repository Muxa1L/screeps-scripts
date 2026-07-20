var TaskType = require('task.base');
var taskBase = require('taskBase');
var move = require('utils.move');

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
        if (creep.carry.energy === creep.carryCapacity) {
            var targets = creep.room.find(FIND_STRUCTURES, {
                filter: function (s) {
                    return (s.structureType === STRUCTURE_EXTENSION ||
                            s.structureType === STRUCTURE_SPAWN ||
                            s.structureType === STRUCTURE_TOWER) &&
                           s.energy < s.energyCapacity;
                },
            });
            if (targets.length === 0) return false;
            var nearest = creep.pos.findClosestByPath(targets);
            if (!nearest) return false;
            move.action(creep, 'transfer@' + nearest.id);
            if (creep.transfer(nearest, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                move.moveCreep(creep, nearest, { visualizePathStyle: { stroke: '#ffffff' } });
            }
            return true;
        }
        if (creep.carry.energy > 0) return true;
        move.action(creep, 'withdraw@' + container.id);
        if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            move.moveCreep(creep, container, { visualizePathStyle: { stroke: '#ffffaa' } });
        }
        return true;
    },
});
