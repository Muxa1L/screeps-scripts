var pathCache = require('pathCache');

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
    RENEW: 'renew',
    SWEEP: 'sweep',
    MINE: 'mine',
    HAUL: 'haul',
    HARVEST: 'harvest',
    BUILD: 'build',
    REPAIR: 'repair',
    UPGRADE: 'upgrade',
    IDLE: 'idle',
};

var TASK_CAPS = {
    body: {
        DEFEND: function (c) { return c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0; },
        HEAL: function (c) { return c.getActiveBodyparts(HEAL) > 0; },
        RENEW: function () { return true; },
        SWEEP: function (c) { return c.getActiveBodyparts(CARRY) > 0; },
        MINE: function (c) { return c.getActiveBodyparts(WORK) > 0 && c.getActiveBodyparts(CARRY) === 0; },
        HAUL: function (c) { return c.getActiveBodyparts(CARRY) > 0; },
        HARVEST: function (c) { return c.getActiveBodyparts(WORK) > 0 && c.getActiveBodyparts(CARRY) > 0; },
        BUILD: function (c) { return c.getActiveBodyparts(WORK) > 0 && c.getActiveBodyparts(CARRY) > 0; },
        REPAIR: function (c) { return c.getActiveBodyparts(WORK) > 0 && c.getActiveBodyparts(CARRY) > 0; },
        UPGRADE: function (c) { return c.getActiveBodyparts(WORK) > 0 && c.getActiveBodyparts(CARRY) > 0; },
    },
    minCarry: {
        HAUL: 1,
        SWEEP: 1,
        HARVEST: 1,
        BUILD: 1,
        REPAIR: 1,
        UPGRADE: 1,
    },
};

function makeId(type, roomName, targetId) {
    return type + ':' + roomName + ':' + targetId;
}

function creepCanDo(creep, type) {
    if (!TASK_CAPS.body[type]) return false;
    if (!TASK_CAPS.body[type](creep)) return false;
    var minCarry = TASK_CAPS.minCarry[type] || 0;
    if (minCarry > 0 && creep.getActiveBodyparts(CARRY) < minCarry) return false;
    return true;
}

function moveCreep(creep, target, opts) {
    if (!target) return;
    if (creep.pos.isNearTo(target)) return;
    var key = creep.pos.roomName + ':' + target.id + ':' + creep.name;
    var path = pathCache.get(key);
    if (path && path.length > 0) {
        var next = path[0];
        var dir = creep.pos.getDirectionTo(next);
        if (dir) {
            creep.move(dir);
            return;
        }
    }
    var ret = PathFinder.search(creep.pos, { pos: target.pos, range: 1 }, { maxOps: 800 });
    if (!ret.incomplete && ret.path && ret.path.length > 0) {
        pathCache.set(key, ret.path);
        var d = creep.pos.getDirectionTo(ret.path[0]);
        if (d) creep.move(d);
    } else {
        creep.moveTo(target, opts || { visualizePathStyle: { stroke: '#ffffff' } });
    }
}

module.exports = {
    PRIORITY: PRIORITY,
    TASK_TYPE: TASK_TYPE,
    makeId: makeId,
    creepCanDo: creepCanDo,
    moveCreep: moveCreep,
};
