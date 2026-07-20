var pathCache = require('pathCache');
var logger = require('logger');
var taskBase = require('taskBase');

var SWAMP_COST = 10;
var WALL_COST = 0xff;
var CREEP_COST = 0xff;
var CREEP_NEXT_COST = 0x80;

var _terrainCache = {};
var _terrainCacheTick = 0;

function buildTerrainMatrix(roomName) {
    var room = Game.rooms[roomName];
    if (!room) return null;
    var matrix = new PathFinder.CostMatrix();
    var terrain = room.getTerrain();
    for (var y = 0; y < 50; y++) {
        for (var x = 0; x < 50; x++) {
            var t = terrain.get(x, y);
            if (t === TERRAIN_MASK_WALL) {
                matrix.set(x, y, WALL_COST);
            } else if (t === TERRAIN_MASK_SWAMP) {
                matrix.set(x, y, SWAMP_COST);
            }
        }
    }
    return matrix;
}

function getTerrainMatrix(roomName) {
    if (_terrainCacheTick !== Game.time) {
        _terrainCache = {};
        _terrainCacheTick = Game.time;
    }
    if (!_terrainCache[roomName]) {
        _terrainCache[roomName] = buildTerrainMatrix(roomName);
    }
    return _terrainCache[roomName];
}

function markCreeps(matrix, roomName, self) {
    var room = Game.rooms[roomName];
    if (!room) return;
    var creeps = room.find(FIND_CREEPS);
    for (var i = 0; i < creeps.length; i++) {
        var c = creeps[i];
        if (c === self) continue;
        if (!c.my) continue;
        var existing = matrix.get(c.pos.x, c.pos.y);
        if (existing === 0 || existing === undefined) {
            matrix.set(c.pos.x, c.pos.y, CREEP_COST);
        }
        var nextDir = c.memory._nextDir;
        if (nextDir !== undefined) {
            var dx = [0, 0, 1, 1, 1, 0, -1, -1, -1][nextDir];
            var dy = [-1, 1, -1, 0, 1, 0, 1, -1, 0][nextDir];
            if (dx !== undefined) {
                var nx = c.pos.x + dx;
                var ny = c.pos.y + dy;
                if (nx >= 0 && nx <= 49 && ny >= 0 && ny <= 49) {
                    var nextExisting = matrix.get(nx, ny);
                    if (nextExisting === 0 || nextExisting === undefined) {
                        matrix.set(nx, ny, CREEP_NEXT_COST);
                    }
                }
            }
        }
    }
}

function makeCreepCostMatrix(roomName, self) {
    var base = getTerrainMatrix(roomName);
    if (!base) {
        var m = new PathFinder.CostMatrix();
        markCreeps(m, roomName, self);
        return m;
    }
    var matrix = base.clone();
    markCreeps(matrix, roomName, self);
    return matrix;
}

function moveCreep(creep, target, opts) {
    if (!target) return;
    if (!target.pos) return;
    if (creep.pos.isNearTo(target)) return;
    if (creep.fatigue > 0) return;

    var key = creep.pos.roomName + ':' + target.id + ':' + creep.name;
    var entry = pathCache.get(key);
    if (entry && entry.path && entry.idx < entry.path.length) {
        if (entry.origin &&
            (entry.origin.x !== creep.pos.x ||
             entry.origin.y !== creep.pos.y ||
             entry.origin.roomName !== creep.pos.roomName)) {
            pathCache.del(key);
            entry = null;
        }
    }
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
                        creep.memory._nextDir = dir;
                        return;
                    }
                    if (mv === ERR_TIRED || mv === ERR_BUSY) return;
                    pathCache.del(key);
                }
            }
        }
    }

    var matrix = makeCreepCostMatrix(creep.pos.roomName, creep);
    var ret = PathFinder.search(
        creep.pos,
        { pos: target.pos, range: 1 },
        {
            maxOps: 1500,
            plainCost: 2,
            swampCost: SWAMP_COST,
            roomCallback: function (rn) {
                if (rn === creep.pos.roomName) return matrix;
                return new PathFinder.CostMatrix();
            },
        }
    );
    if (!ret.incomplete && ret.path && ret.path.length > 0) {
        pathCache.set(key, ret.path, { x: creep.pos.x, y: creep.pos.y, roomName: creep.pos.roomName });
        var d = creep.pos.getDirectionTo(ret.path[0]);
        if (d && d > 0) {
            creep.move(d);
            creep.memory._nextDir = d;
            return;
        }
    }
    var mvr = creep.moveTo(target, Object.assign({ reusePath: 10, maxOps: 1500 }, opts || {}));
    if (mvr !== OK && mvr !== ERR_TIRED && mvr !== ERR_BUSY) {
        pathCache.del(key);
    }
}

function action(creep, verb) {
    if (creep && logger && logger.setAction) logger.setAction(creep, verb);
}

module.exports = {
    moveCreep: moveCreep,
    action: action,
    makeCreepCostMatrix: makeCreepCostMatrix,
    taskBase: taskBase,
};

