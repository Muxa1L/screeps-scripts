var TaskType = require('taskBaseClass');
var taskBase = require('taskBase');
var move = require('moveUtil');

var PATH_CACHE_TICKS = 10;
var _pathCache = {};

function pathLength(creep, target) {
    if (!target || !target.pos) return 9999;
    if (creep.pos.roomName !== target.pos.roomName) {
        return taskBase.approxDistance(creep, target);
    }
    var key = creep.pos.roomName + ':' + creep.pos.x + ',' + creep.pos.y + ':' + target.id;
    var entry = _pathCache[key];
    if (entry && Game.time - entry.time < PATH_CACHE_TICKS) {
        return entry.length;
    }
    var path = creep.pos.findPathTo(target, {
        ignoreCreeps: true,
        swampCost: 5,
        plainCost: 2,
    });
    var len = path ? path.length : 9999;
    _pathCache[key] = { time: Game.time, length: len };
    return len;
}

module.exports = new TaskType({
    type: 'harvest',
    priority: taskBase.PRIORITY.HARVEST,
    cap: 2,
    canDo: function (creep) {
        return creep.getActiveBodyparts(WORK) > 0 && creep.getActiveBodyparts(CARRY) > 0;
    },
    tasks: function (room, snap) {
        return snap.sources.map(function (s) { return { target: s }; });
    },
    score: function (creep, target) {
        return pathLength(creep, target);
    },
    run: function (creep, task) {
        var source = task.target;
        if (!source) return false;
        if (creep.carry.energy === creep.carryCapacity) {
            return false;
        }
        var ret = creep.harvest(source);
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
