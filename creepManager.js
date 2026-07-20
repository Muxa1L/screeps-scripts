var taskBase = require('taskBase');
var taskRegistry = require('taskRegistry');
var taskHandlers = require('taskHandlers');
var renew = require('taskRenew');

var RENEW_THRESHOLD = 400;

function approxDistance(creep, target) {
    if (!target || !target.pos) return 9999;
    if (creep.pos.roomName !== target.pos.roomName) {
        return 50 + (Game.map.getRoomLinearDistance(creep.pos.roomName, target.pos.roomName) || 1) * 50;
    }
    var dx = Math.abs(creep.pos.x - target.pos.x);
    var dy = Math.abs(creep.pos.y - target.pos.y);
    return Math.max(dx, dy);
}

function bestTaskFor(creep, tasks, allowed) {
    var best = null;
    var bestScore = Infinity;
    for (var i = 0; i < tasks.length; i++) {
        var t = tasks[i];
        if (allowed && allowed.indexOf(t.type) === -1) continue;
        if (!taskBase.creepCanDo(creep, t.type)) continue;
        var target = t.target;
        if (!target || !target.pos) continue;
        var dist = approxDistance(creep, target);
        var score = t.priority * 1000 + dist;
        if (score < bestScore) {
            bestScore = score;
            best = t;
        }
    }
    return best;
}

var RESTRICTED_TASKS = {
    miner:  ['mine'],
    hauler: ['haul', 'sweep'],
    fighter:['defend'],
    healer: ['heal'],
};

function runCreep(creep) {
    if (!creep.memory.role) {
        creep.memory.role = creep.name.startsWith('Harvester') ? 'generalist'
            : creep.name.startsWith('Miner') ? 'miner'
            : creep.name.startsWith('Hauler') ? 'hauler'
            : creep.name.startsWith('Upgrader') ? 'upgrader'
            : creep.name.startsWith('Builder') ? 'builder'
            : creep.name.startsWith('Fighter') ? 'fighter'
            : creep.name.startsWith('Healer') ? 'healer'
            : 'generalist';
    }

    if (creep.ticksToLive < RENEW_THRESHOLD && Game.spawns['Spawn1'] && Game.spawns['Spawn1'].energy > 50) {
        renew.run(creep);
        return;
    }

    var room = creep.room;
    if (!room) return;

    if (creep.getActiveBodyparts(MOVE) === 0) {
        debug(creep.name + ' has no MOVE parts');
        return;
    }

    var tasks = taskRegistry.list(room);
    var allowed = RESTRICTED_TASKS[creep.memory.role];

    var assigned = null;
    if (creep.memory.taskId) {
        for (var i = 0; i < tasks.length; i++) {
            if (tasks[i].id === creep.memory.taskId) {
                assigned = tasks[i];
                break;
            }
        }
        if (!assigned) {
            creep.memory.taskId = null;
        }
    }
    if (!assigned) {
        assigned = bestTaskFor(creep, tasks, allowed);
        if (assigned && Memory.flags && Memory.flags.debugTasks) {
            console.log('[task] ' + creep.name + ' (' + creep.memory.role + ') -> ' + assigned.type + ' target=' + (assigned.target && assigned.target.id));
        }
    }
    if (!assigned) {
        creep.memory.taskId = null;
        var forceTarget = forceTargetFor(creep, room);
        if (forceTarget) {
            if (!creep.pos.isNearTo(forceTarget)) {
                creep.moveTo(forceTarget, { visualizePathStyle: { stroke: '#ff00ff' } });
            } else {
                var ha = creep.harvest(forceTarget);
                if (ha === ERR_NOT_IN_RANGE) {
                    creep.moveTo(forceTarget, { visualizePathStyle: { stroke: '#ff00ff' } });
                }
            }
            return;
        }
        if (Game.spawns['Spawn1'] && !creep.pos.isNearTo(Game.spawns['Spawn1'])) {
            creep.moveTo(Game.spawns['Spawn1'], { visualizePathStyle: { stroke: '#888888' } });
        }
        return;
    }

    creep.memory.taskId = assigned.id;

    var handler = taskHandlers[assigned.type];
    if (handler) {
        var keep = handler(creep, assigned);
        if (keep === false) {
            creep.memory.taskId = null;
        }
    } else {
        debug(creep.name + ' no handler for ' + assigned.type);
    }
}

function forceTargetFor(creep, room) {
    var role = creep.memory.role;
    if (role === 'hauler') {
        var containers = room.find(FIND_STRUCTURES, {
            filter: function (s) { return s.structureType === STRUCTURE_CONTAINER; },
        });
        if (containers.length > 0) {
            return creep.pos.findClosestByPath(containers);
        }
        var drops = room.find(FIND_DROPPED_RESOURCES);
        if (drops.length > 0) {
            return creep.pos.findClosestByPath(drops);
        }
        var tombstones = room.find(FIND_TOMBSTONES, {
            filter: function (t) { return _.sum(t.store) > 0; },
        });
        if (tombstones.length > 0) {
            return creep.pos.findClosestByPath(tombstones);
        }
        return null;
    }
    if (role === 'miner') {
        var slot = null;
        if (Memory.sources) {
            for (var id in Memory.sources) {
                if (Memory.sources[id].roomName !== room.name) continue;
                for (var i = 0; i < Memory.sources[id].slots.length; i++) {
                    var s = Memory.sources[id].slots[i];
                    if (!s.claimedBy || !Game.creeps[s.claimedBy]) {
                        slot = new RoomPosition(s.x, s.y, room.name);
                        break;
                    }
                }
                if (slot) break;
            }
        }
        if (slot) return slot;
        var sources = room.find(FIND_SOURCES);
        if (sources.length > 0) return creep.pos.findClosestByPath(sources);
        return null;
    }
    var sources2 = room.find(FIND_SOURCES);
    if (sources2.length > 0) {
        return creep.pos.findClosestByPath(sources2);
    }
    return null;
}

var _debugLast = {};
function debug(msg) {
    var key = String(msg);
    if (_debugLast[key] && Game.time - _debugLast[key] < 50) return;
    _debugLast[key] = Game.time;
    console.log('[creep] ' + msg);
}

module.exports = {
    tick: function () {
        for (var name in Game.creeps) {
            try {
                runCreep(Game.creeps[name]);
            } catch (e) {
                console.log('creepManager error for ' + name + ': ' + e);
            }
        }
    },
    runCreep: runCreep,
};
