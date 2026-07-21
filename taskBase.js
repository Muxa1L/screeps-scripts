const PRIORITY = {
    DEFEND: 10,
    RENEW: 20,
    HEAL: 30,
    SUPPLY: 35,
    HAUL: 40,
    SWEEP: 50,
    REPAIR_CRITICAL: 55,
    BUILD: 60,
    REPAIR: 65,
    UPGRADE: 70,
    MINE: 80,
    HARVEST: 90,
    IDLE: 100,
};

const TASK_TYPE = {
    DEFEND: 'defend',
    HEAL: 'heal',
    SUPPLY: 'supply',
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
    const dx = Math.abs(creep.pos.x - target.pos.x);
    const dy = Math.abs(creep.pos.y - target.pos.y);
    return Math.max(dx, dy);
}

function describeTask(task) {
    if (!task) return 'none';
    const tgt = task.target;
    const tgtId = (tgt && tgt.id) || '?';
    let tgtName = '';
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

const _pathScoreCache = {};
const PATH_SCORE_TTL = 10;
const PATH_SCORE_CLEANUP_INTERVAL = 50;

function pathScore(creep, target) {
    if (!target || !target.pos) return 9999;
    if (creep.pos.roomName !== target.pos.roomName) {
        return approxDistance(creep, target);
    }
    const key = creep.pos.roomName + ':' + creep.pos.x + ',' + creep.pos.y + ':' + target.id;
    const entry = _pathScoreCache[key];
    if (entry && Game.time - entry.time < PATH_SCORE_TTL) {
        return entry.length;
    }
    const path = creep.pos.findPathTo(target, {
        ignoreCreeps: true,
        swampCost: 5,
        plainCost: 2,
    });
    const len = path ? path.length : 9999;
    _pathScoreCache[key] = { time: Game.time, length: len };

    if (Game.time % PATH_SCORE_CLEANUP_INTERVAL === 0) {
        cleanupPathScoreCache();
    }
    return len;
}

function cleanupPathScoreCache() {
    const now = Game.time;
    for (const k in _pathScoreCache) {
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
