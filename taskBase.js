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
        defend:  function (c) { return c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0; },
        heal:    function (c) { return c.getActiveBodyparts(HEAL) > 0; },
        renew:   function () { return true; },
        sweep:   function (c) { return c.getActiveBodyparts(CARRY) > 0; },
        mine:    function (c) { return c.getActiveBodyparts(WORK) > 0 && c.getActiveBodyparts(CARRY) === 0; },
        haul:    function (c) { return c.getActiveBodyparts(CARRY) > 0; },
        harvest: function (c) { return c.getActiveBodyparts(WORK) > 0 && c.getActiveBodyparts(CARRY) > 0; },
        build:   function (c) { return c.getActiveBodyparts(WORK) > 0 && c.getActiveBodyparts(CARRY) > 0; },
        repair:  function (c) { return c.getActiveBodyparts(WORK) > 0 && c.getActiveBodyparts(CARRY) > 0; },
        upgrade: function (c) { return c.getActiveBodyparts(WORK) > 0 && c.getActiveBodyparts(CARRY) > 0; },
    },
    minCarry: {
        haul: 1,
        sweep: 1,
        harvest: 1,
        build: 1,
        repair: 1,
        upgrade: 1,
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
    if (!target.pos) return;
    if (creep.pos.isNearTo(target)) return;
    if (creep.fatigue > 0) return;

    var key = creep.pos.roomName + ':' + target.id + ':' + creep.name;
    var entry = pathCache.get(key);
    if (entry && entry.path && entry.idx < entry.path.length) {
        var next = entry.path[entry.idx];
        if (next && next.x !== undefined) {
            if (creep.pos.isEqualTo(next)) {
                pathCache.advance(key);
                next = entry.path[entry.idx];
            }
            if (next && next.x !== undefined) {
                var dir = creep.pos.getDirectionTo(next);
                if (dir && dir > 0) {
                    var mv = creep.move(dir);
                    if (mv === OK) {
                        pathCache.advance(key);
                        return;
                    }
                    if (mv === ERR_TIRED || mv === ERR_BUSY) return;
                    pathCache.del(key);
                }
            }
        }
    }

    var ret = PathFinder.search(
        creep.pos,
        { pos: target.pos, range: 1 },
        { maxOps: 1500, plainCost: 2, swampCost: 10 }
    );
    if (!ret.incomplete && ret.path && ret.path.length > 0) {
        pathCache.set(key, ret.path);
        var d = creep.pos.getDirectionTo(ret.path[0]);
        if (d && d > 0) {
            creep.move(d);
            return;
        }
    }
    var mvr = creep.moveTo(target, Object.assign({ reusePath: 10, maxOps: 1500 }, opts || {}));
    if (mvr !== OK && mvr !== ERR_TIRED && mvr !== ERR_BUSY) {
        pathCache.del(key);
    }
}

module.exports = {
    PRIORITY: PRIORITY,
    TASK_TYPE: TASK_TYPE,
    makeId: makeId,
    creepCanDo: creepCanDo,
    moveCreep: moveCreep,
};
