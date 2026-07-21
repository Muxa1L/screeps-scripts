const PRIORITY = require('../config/priorities');
const constants = require('../config/constants');

const PATH_SCORE_TTL = constants.PATH_SCORE_TTL;
const PATH_SCORE_CLEANUP_INTERVAL = constants.PATH_SCORE_CLEANUP_INTERVAL;

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

function isPosNearHostile(snapshot, pos, range) {
    range = range || 5;
    if (!snapshot || !snapshot.hostiles) return false;
    for (let i = 0; i < snapshot.hostiles.length; i++) {
        const hp = snapshot.hostiles[i].pos;
        if (hp.roomName !== pos.roomName) continue;
        if (Math.abs(hp.x - pos.x) <= range && Math.abs(hp.y - pos.y) <= range) return true;
    }
    return false;
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
    isPosNearHostile: isPosNearHostile,
    pathScore: pathScore,
    cleanupPathScoreCache: cleanupPathScoreCache,
};
