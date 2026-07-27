const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');
const memory = require('../../utils/memorySchema');
const constants = require('../../config/constants');

const SQUAD_RETREAT_HP_RATIO = constants.SQUAD_RETREAT_HP_RATIO;
const SQUAD_TARGET_LATCH_TICKS = constants.SQUAD_TARGET_LATCH_TICKS;

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

        // Honor mutual squad retreat: if the squad manager flagged retreat
        // via squadTarget or the creep is below threshold, run to spawn.
        const latchedId = memory.getSquadTarget(creep);
        const latchedTick = memory.getSquadTargetTick(creep);
        const latchValid = latchedId && Game.time - latchedTick < SQUAD_TARGET_LATCH_TICKS;

        if (creep.hits < creep.hitsMax * SQUAD_RETREAT_HP_RATIO) {
            const retreat = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
            if (retreat) {
                move.action(creep, 'retreating@' + (target.id || '?'));
                move.moveCreep(creep, retreat, { visualizePathStyle: { stroke: '#ff0000' } });
            }
            return true;
        }

        // Prefer the squad-shared target if latched; otherwise nearest live hostile.
        const enemy = (latchValid && Game.getObjectById(latchedId)) ||
            creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS) ||
            live;
        if (!enemy || enemy.hits <= 0) return false;

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
