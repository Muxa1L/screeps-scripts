var TaskType = require('taskBaseClass');
var taskBase = require('taskBase');
var move = require('moveUtil');

module.exports = new TaskType({
    type: 'repair',
    priority: taskBase.PRIORITY.REPAIR,
    cap: 2,
    canDo: function (creep) {
        return creep.getActiveBodyparts(WORK) > 0 && creep.getActiveBodyparts(CARRY) > 0;
    },
    tasks: function (room, snap) {
        var out = [];
        for (var i = 0; i < snap.damagedCritical.length; i++) {
            out.push({ target: snap.damagedCritical[i] });
        }
        for (var j = 0; j < snap.damagedNonCritical.length; j++) {
            out.push({ target: snap.damagedNonCritical[j] });
        }
        return out;
    },
    run: function (creep, task) {
        var target = task.target;
        if (!target) return false;
        if (creep.carry.energy === 0) return false;
        if (target.hits >= target.hitsMax) return false;
        var res = creep.repair(target);
        if (res === ERR_NOT_IN_RANGE) {
            move.action(creep, 'moving->repair@' + target.id);
            move.moveCreep(creep, target, { visualizePathStyle: { stroke: '#aaaaff' } });
            return true;
        }
        move.action(creep, 'repairing@' + target.id);
        if (res === OK && target.hitsMax - target.hits <= creep.getActiveBodyparts(WORK) * REPAIR_POWER) {
            return false;
        }
        return true;
    },
});
