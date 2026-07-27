const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');
const roomManager = require('../../managers/roomManager');
const memory = require('../../utils/memorySchema');

let _harvestCountTick = -1;
let _harvestCountCache = {};
// Count harvesters currently assigned to each source's harvest task, built
// once per tick. Harvesters don't use sourceRegistry claims (miners do), so
// count assignments directly. Used by score() to spread harvesters across
// sources, mirroring taskMine.score's claims penalty.
function harvestCounts() {
    if (_harvestCountTick !== Game.time) {
        _harvestCountTick = Game.time;
        _harvestCountCache = {};
        for (const name in Game.creeps) {
            const c = Game.creeps[name];
            if (memory.getRole(c) !== 'harvester') continue;
            const tid = memory.getTaskId(c);
            if (!tid || tid.indexOf('harvest:') !== 0) continue;
            const sourceId = tid.split(':')[2];
            if (sourceId) _harvestCountCache[sourceId] = (_harvestCountCache[sourceId] || 0) + 1;
        }
    }
    return _harvestCountCache;
}

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
        const dist = taskBase.approxDistance(creep, target);
        let claims = harvestCounts()[target.id] || 0;
        // Exclude the creep's own current harvest assignment so it isn't
        // penalized for its own presence (mirrors taskMine.score line 34).
        const own = memory.getTaskId(creep);
        if (own && own.indexOf('harvest:') === 0 && own.split(':')[2] === target.id) {
            claims = Math.max(0, claims - 1);
        }
        return dist + claims * 50;
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
