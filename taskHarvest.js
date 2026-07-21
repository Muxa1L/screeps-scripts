const TaskType = require('taskBaseClass');
const taskBase = require('taskBase');
const move = require('moveUtil');
const roomManager = require('roomManager');

module.exports = new TaskType({
    type: 'harvest',
    priority: taskBase.PRIORITY.HARVEST,
    cap: 2,
    canDo: function (creep) {
        return creep.getActiveBodyparts(WORK) > 0 && creep.getActiveBodyparts(CARRY) > 0;
    },
    tasks: function (room, snap) {
        const out = [];
        for (let i = 0; i < snap.sources.length; i++) {
            const s = snap.sources[i];
            if (roomManager.isPosNearHostile(room.name, s.pos, 5)) continue;
            out.push({ target: s });
        }
        return out;
    },
    score: function (creep, target) {
        return taskBase.pathScore(creep, target);
    },
    run: function (creep, task) {
        const source = task.target;
        if (!source) return false;
        if (creep.store[RESOURCE_ENERGY] >= creep.store.getCapacity(RESOURCE_ENERGY)) {
            return false;
        }
        const ret = creep.harvest(source);
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
