var TaskType = require('taskBaseClass');
var taskBase = require('taskBase');
var move = require('moveUtil');

module.exports = new TaskType({
    type: 'harvest',
    priority: taskBase.PRIORITY.HARVEST,
    cap: 2,
    canDo: function (creep) {
        return creep.getActiveBodyparts(WORK) > 0 && creep.getActiveBodyparts(CARRY) > 0;
    },
    tasks: function (room, snap) {
        return snap.sources.map(function (s) { return { target: s }; });
    },
    run: function (creep, task) {
        var source = task.target;
        if (!source) return false;
        if (creep.carry.energy === creep.carryCapacity) {
            return false;
        }
        var ret = creep.harvest(source);
        if (ret === OK) {
            move.action(creep, 'harvesting@' + source.id);
            return true;
        }
        move.action(creep, 'moving->harvest@' + source.id);
        if (ret === ERR_NOT_IN_RANGE) {
            move.moveCreep(creep, source, { visualizePathStyle: { stroke: '#ffaa00' } });
        }
        return true;
    },
});
