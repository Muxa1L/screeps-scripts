var PRIORITY = {
    DEFEND: 10,
    RENEW: 20,
    HEAL: 30,
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

module.exports = {
    PRIORITY: PRIORITY,
    TASK_TYPE: TASK_TYPE,
    makeId: makeId,
    makeTask: makeTask,
    approxDistance: approxDistance,
    describeTask: describeTask,
};
