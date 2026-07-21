const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');
const roomManager = require('../../managers/roomManager');

module.exports = {
    type: 'harvest',
    priority: taskBase.PRIORITY.HARVEST,
    requirements: { work: 1, carry: 1 },
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
    run: function (creep, task, _snap) {
        const source = task.target;
        if (!source) return false;
        const live = source.id ? Game.getObjectById(source.id) : null;
        if (!live || live.energy === 0) return false;
        if (creep.store[RESOURCE_ENERGY] >= creep.store.getCapacity(RESOURCE_ENERGY)) {
            return false;
        }
        const ret = creep.harvest(live);
        if (ret === OK) {
            move.action(creep, 'harvesting@' + live.id);
            return true;
        }
        move.action(creep, 'moving->harvest@' + live.id);
        if (ret === ERR_NOT_IN_RANGE) {
            move.moveCreep(creep, live, { visualizePathStyle: { stroke: '#ffaa00' } });
        }
        return true;
    },
};
