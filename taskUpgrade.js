var TaskType = require('taskBaseClass');
var taskBase = require('taskBase');
var move = require('moveUtil');

module.exports = new TaskType({
    type: 'upgrade',
    priority: taskBase.PRIORITY.UPGRADE,
    cap: 2,
    canDo: function (creep) {
        return creep.getActiveBodyparts(WORK) > 0 && creep.getActiveBodyparts(CARRY) > 0;
    },
    tasks: function (room, snap) {
        if (room.controller && room.controller.my) {
            return [{ target: room.controller }];
        }
        return [];
    },
    run: function (creep, task) {
        var controller = task.target;
        if (!controller) return false;
        if (creep.carry.energy === 0) return false;
        var res = creep.upgradeController(controller);
        if (res === ERR_NOT_IN_RANGE) {
            move.action(creep, 'moving->upgrade');
            move.moveCreep(creep, controller, { visualizePathStyle: { stroke: '#ffffff' } });
            return true;
        }
        move.action(creep, 'upgrading');
        return true;
    },
});
