const TaskType = require('taskBaseClass');
const taskBase = require('taskBase');
const move = require('moveUtil');

module.exports = new TaskType({
    type: 'repair',
    priority: taskBase.PRIORITY.REPAIR,
    cap: 2,
    canDo: function (creep) {
        return creep.getActiveBodyparts(WORK) > 0 && creep.getActiveBodyparts(CARRY) > 0;
    },
    tasks: function (room, snap) {
        const out = [];
        for (let i = 0; i < snap.damagedCritical.length; i++) {
            out.push({ target: snap.damagedCritical[i] });
        }
        for (let j = 0; j < snap.damagedNonCritical.length; j++) {
            out.push({ target: snap.damagedNonCritical[j] });
        }
        return out;
    },
    run: function (creep, task) {
        const target = task.target;
        if (!target) return false;
        if (creep.store[RESOURCE_ENERGY] === 0) return false;
        if (target.hits >= target.hitsMax) return false;
        const res = creep.repair(target);
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
