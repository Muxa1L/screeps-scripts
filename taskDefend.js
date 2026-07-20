var TaskType = require('taskBaseClass');
var taskBase = require('taskBase');
var move = require('moveUtil');

module.exports = new TaskType({
    type: 'defend',
    priority: taskBase.PRIORITY.DEFEND,
    cap: 4,
    canDo: function (creep) {
        return creep.getActiveBodyparts(ATTACK) > 0 || creep.getActiveBodyparts(RANGED_ATTACK) > 0;
    },
    tasks: function (room, snap) {
        return snap.hostiles.map(function (h) { return { target: h }; });
    },
    run: function (creep, task) {
        var target = task.target;
        if (!target || target.hits === undefined || target.hits <= 0) return false;
        var attackParts = creep.getActiveBodyparts(ATTACK);
        var rangedParts = creep.getActiveBodyparts(RANGED_ATTACK);
        if (attackParts === 0 && rangedParts === 0) return false;

        if (creep.hits < creep.hitsMax * 0.4) {
            var retreat = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
            if (retreat) {
                move.action(creep, 'retreating@' + target.id);
                move.moveCreep(creep, retreat, { visualizePathStyle: { stroke: '#ff0000' } });
            }
            return true;
        }
        if (creep.pos.inRangeTo(target, 1) && rangedParts > 0 && attackParts === 0) {
            creep.rangedMassAttack();
        }
        if (attackParts > 0) {
            var res = creep.attack(target);
            if (res === ERR_NOT_IN_RANGE) {
                move.action(creep, 'attacking@' + target.id);
                move.moveCreep(creep, target, { visualizePathStyle: { stroke: '#ff0000' } });
            } else {
                move.action(creep, 'attacking@' + target.id);
            }
        } else if (rangedParts > 0) {
            var res2 = creep.rangedAttack(target);
            if (res2 === ERR_NOT_IN_RANGE) {
                move.action(creep, 'ranged@' + target.id);
                move.moveCreep(creep, target, { visualizePathStyle: { stroke: '#ff0000' } });
            } else {
                move.action(creep, 'ranged@' + target.id);
            }
        }
        return true;
    },
});
