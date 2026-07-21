const TaskType = require('taskBaseClass');
const taskBase = require('taskBase');
const move = require('moveUtil');

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
        const target = task.target;
        if (!target || !target.id) return false;
        const live = Game.getObjectById(target.id);
        if (!live || live.hits === undefined || live.hits >= live.hitsMax) return false;
        const selfMissing = creep.hitsMax - creep.hits;
        const targetMissing = live.hitsMax - live.hits;
        if (selfMissing > 0 && (selfMissing > targetMissing || creep.hits < creep.hitsMax * 0.5)) {
            move.action(creep, 'self-heal');
            creep.heal(creep);
            return true;
        }
        move.action(creep, 'healing@' + live.id);
        const res = creep.heal(live);
        if (res === ERR_NOT_IN_RANGE) {
            if (creep.pos.inRangeTo(live, 3)) {
                creep.rangedHeal(live);
            } else {
                move.moveCreep(creep, live, { visualizePathStyle: { stroke: '#00ff00' } });
            }
        }
        return true;
    },
});
