const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');

module.exports = {
    type: 'defend',
    priority: taskBase.PRIORITY.DEFEND,
    requirements: { attack: 1 },
    cap: 4,
    canDo: function (creep) {
        return creep.getActiveBodyparts(ATTACK) > 0 || creep.getActiveBodyparts(RANGED_ATTACK) > 0;
    },
    tasks: function (room, snap) {
        return snap.hostiles.map(function (h) { return { target: h }; });
    },
    run: function (creep, task, _snap) {
        const target = task.target;
        if (!target || !target.id) return false;
        const live = Game.getObjectById(target.id);
        if (!live || live.hits === undefined || live.hits <= 0) return false;
        const attackParts = creep.getActiveBodyparts(ATTACK);
        const rangedParts = creep.getActiveBodyparts(RANGED_ATTACK);
        if (attackParts === 0 && rangedParts === 0) return false;

        if (creep.hits < creep.hitsMax * 0.4) {
            const retreat = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
            if (retreat) {
                move.action(creep, 'retreating@' + live.id);
                move.moveCreep(creep, retreat, { visualizePathStyle: { stroke: '#ff0000' } });
            }
            return true;
        }
        if (creep.pos.inRangeTo(live, 1) && rangedParts > 0 && attackParts === 0) {
            creep.rangedMassAttack();
        }
        if (attackParts > 0) {
            const res = creep.attack(live);
            if (res === ERR_NOT_IN_RANGE) {
                move.action(creep, 'attacking@' + live.id);
                move.moveCreep(creep, live, { visualizePathStyle: { stroke: '#ff0000' } });
            } else {
                move.action(creep, 'attacking@' + live.id);
            }
        } else if (rangedParts > 0) {
            const res2 = creep.rangedAttack(live);
            if (res2 === ERR_NOT_IN_RANGE) {
                move.action(creep, 'ranged@' + live.id);
                move.moveCreep(creep, live, { visualizePathStyle: { stroke: '#ff0000' } });
            } else {
                move.action(creep, 'ranged@' + live.id);
            }
        }
        return true;
    },
};
