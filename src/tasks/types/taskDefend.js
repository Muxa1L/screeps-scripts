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
    score: function (creep, target) {
        // Prefer the live nearest hostile. Snapshot positions can be stale if
        // the target moved since the room snapshot was built.
        const live = target && target.id ? Game.getObjectById(target.id) : null;
        return taskBase.approxDistance(creep, live || target);
    },
    run: function (creep, task, _snap) {
        const target = task.target;
        if (!target || !target.id) return false;
        const live = Game.getObjectById(target.id);
        if (!live || live.hits === undefined || live.hits <= 0) return false;
        const attackParts = creep.getActiveBodyparts(ATTACK);
        const rangedParts = creep.getActiveBodyparts(RANGED_ATTACK);
        if (attackParts === 0 && rangedParts === 0) return false;

        // Always look for the closest live hostile in this room; if a nearer
        // enemy exists, switch to it immediately rather than chasing a stale target.
        const nearest = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        const enemy = (nearest && nearest.hits > 0) ? nearest : live;

        if (creep.hits < creep.hitsMax * 0.4) {
            const retreat = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
            if (retreat) {
                move.action(creep, 'retreating@' + enemy.id);
                move.moveCreep(creep, retreat, { visualizePathStyle: { stroke: '#ff0000' } });
            }
            return true;
        }

        const inRange1 = creep.pos.inRangeTo(enemy, 1);
        if (inRange1 && rangedParts > 0 && attackParts === 0) {
            creep.rangedMassAttack();
        }
        if (attackParts > 0) {
            const res = creep.attack(enemy);
            if (res === ERR_NOT_IN_RANGE) {
                move.action(creep, 'attacking@' + enemy.id);
                move.moveCreep(creep, enemy, { visualizePathStyle: { stroke: '#ff0000' } });
            } else {
                move.action(creep, 'attacking@' + enemy.id);
            }
        } else if (rangedParts > 0) {
            const res2 = creep.rangedAttack(enemy);
            if (res2 === ERR_NOT_IN_RANGE) {
                move.action(creep, 'ranged@' + enemy.id);
                move.moveCreep(creep, enemy, { visualizePathStyle: { stroke: '#ff0000' } });
            } else {
                move.action(creep, 'ranged@' + enemy.id);
            }
        }
        return true;
    },
};
