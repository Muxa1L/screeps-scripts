var PRIORITY = {
    DEFEND: 10,
    RENEW: 20,
    HEAL: 30,
    UPGRADE_EMERGENCY: 35,
    SWEEP: 40,
    HAUL: 50,
    REPAIR_CRITICAL: 55,
    BUILD: 60,
    REPAIR: 65,
    UPGRADE: 70,
    MINE: 80,
    HARVEST: 90,
    IDLE: 100,
};

var TASK_TYPE = {
    DEFEND: 'defend',
    HEAL: 'heal',
    SWEEP: 'sweep',
    HAUL: 'haul',
    BUILD: 'build',
    REPAIR: 'repair',
    UPGRADE: 'upgrade',
    MINE: 'mine',
    HARVEST: 'harvest',
    IDLE: 'idle',
};

function makeId(type, roomName, targetId) {
    return type + ':' + roomName + ':' + targetId;
}

function approxDistance(creep, target) {
    if (!target || !target.pos) return 9999;
    if (creep.pos.roomName !== target.pos.roomName) {
        return 50 + (Game.map.getRoomLinearDistance(creep.pos.roomName, target.pos.roomName) || 1) * 50;
    }
    var dx = Math.abs(creep.pos.x - target.pos.x);
    var dy = Math.abs(creep.pos.y - target.pos.y);
    return Math.max(dx, dy);
}

function describeTask(task) {
    if (!task) return 'none';
    var tgt = task.target;
    var tgtId = (tgt && tgt.id) || '?';
    var tgtName = '';
    if (tgt) {
        if (tgt.structureType) tgtName = tgt.structureType;
        else if (tgt.name) tgtName = tgt.name;
        else if (tgt.amount !== undefined) tgtName = 'drop=' + tgt.amount;
    }
    return task.type + '@' + tgtId + (tgtName ? '(' + tgtName + ')' : '');
}

function makeTask(type, priority, target, roomName) {
    return {
        id: makeId(type, roomName, target.id),
        type: type,
        priority: priority,
        target: target,
        roomName: roomName,
    };
}

var _pathScoreCache = {};
var PATH_SCORE_TTL = 10;
var PATH_SCORE_CLEANUP_INTERVAL = 50;

function pathScore(creep, target) {
    if (!target || !target.pos) return 9999;
    if (creep.pos.roomName !== target.pos.roomName) {
        return approxDistance(creep, target);
    }
    var key = creep.pos.roomName + ':' + creep.pos.x + ',' + creep.pos.y + ':' + target.id;
    var entry = _pathScoreCache[key];
    if (entry && Game.time - entry.time < PATH_SCORE_TTL) {
        return entry.length;
    }
    var path = creep.pos.findPathTo(target, {
        ignoreCreeps: true,
        swampCost: 5,
        plainCost: 2,
    });
    var len = path ? path.length : 9999;
    _pathScoreCache[key] = { time: Game.time, length: len };

    if (Game.time % PATH_SCORE_CLEANUP_INTERVAL === 0) {
        cleanupPathScoreCache();
    }
    return len;
}

function cleanupPathScoreCache() {
    var now = Game.time;
    for (var k in _pathScoreCache) {
        if (now - _pathScoreCache[k].time > PATH_SCORE_TTL * 2) {
            delete _pathScoreCache[k];
        }
    }
}

module.exports = {
    PRIORITY: PRIORITY,
    TASK_TYPE: TASK_TYPE,
    makeId: makeId,
    makeTask: makeTask,
    approxDistance: approxDistance,
    describeTask: describeTask,
    pathScore: pathScore,
    cleanupPathScoreCache: cleanupPathScoreCache,
};
