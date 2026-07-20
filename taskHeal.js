var TaskType = require('taskBaseClass');
var taskBase = require('taskBase');
var move = require('moveUtil');

module.exports = new TaskType({
    type: 'heal',
    priority: taskBase.PRIORITY.HEAL,
    cap: 4,
    canDo: function (creep) {
        return creep.getActiveBodyparts(HEAL) > 0;
    },
    tasks: function (room, snap) {
        return snap.damagedFriendlies.map(function (c) { return { target: c }; });
    },
    run: function (creep, task) {
        if (creep.getActiveBodyparts(HEAL) === 0) return false;
        var target = task.target;
        if (!target) return false;
        if (creep.hits < creep.hitsMax) {
            move.action(creep, 'self-heal');
            creep.heal(creep);
            return true;
        }
        move.action(creep, 'healing@' + target.id);
        var res = creep.heal(target);
        if (res === ERR_NOT_IN_RANGE) {
            if (creep.pos.inRangeTo(target, 3)) {
                creep.rangedHeal(target);
            } else {
                move.moveCreep(creep, target, { visualizePathStyle: { stroke: '#00ff00' } });
            }
        }
        return true;
    },
});
