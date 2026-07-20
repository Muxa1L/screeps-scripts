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
        if (t.reservedBy && t.reservedBy !== creep.name) continue;
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

    var moveParts = creep.getActiveBodyparts(MOVE);
    if (moveParts === 0) {
        debug(creep.name + ' has no MOVE parts — cannot move');
        return;
    }

    var tasks = taskRegistry.list(room);
    var allowed = RESTRICTED_TASKS[creep.memory.role];

    if (Game.time % 20 === 0) {
        var types = {};
        for (var ti = 0; ti < tasks.length; ti++) types[tasks[ti].type] = (types[tasks[ti].type] || 0) + 1;
        debug(creep.name + ' role=' + creep.memory.role + ' allowed=' + JSON.stringify(allowed) +
              ' tasks=' + JSON.stringify(types) + ' pos=' + creep.pos.x + ',' + creep.pos.y);
    }

    var assigned = null;
    if (creep.memory.taskId) {
        for (var i = 0; i < tasks.length; i++) {
            if (tasks[i].id === creep.memory.taskId) {
                assigned = tasks[i];
                break;
            }
        }
    }
    if (!assigned) {
        assigned = bestTaskFor(creep, tasks, allowed);
    }
    if (!assigned) {
        creep.memory.taskId = null;
        var forceTarget = forceTargetFor(creep, room);
        if (forceTarget) {
            if (!creep.pos.isNearTo(forceTarget)) {
                var r2 = creep.moveTo(forceTarget, { visualizePathStyle: { stroke: '#ff00ff' } });
                if (r2 !== OK && r2 !== ERR_TIRED) {
                    debug(creep.name + ' force moveTo ' + forceTarget.id + ' -> ' + r2);
                }
            } else {
                var ha = creep.harvest(forceTarget);
                if (ha === ERR_NOT_IN_RANGE) {
                    creep.moveTo(forceTarget, { visualizePathStyle: { stroke: '#ff00ff' } });
                }
            }
            return;
        }
        if (Game.spawns['Spawn1'] && !creep.pos.isNearTo(Game.spawns['Spawn1'])) {
            var r = creep.moveTo(Game.spawns['Spawn1'], { visualizePathStyle: { stroke: '#888888' } });
            if (r !== OK && r !== ERR_TIRED) {
                debug(creep.name + ' no task, moveTo spawn -> ' + r);
            }
        }
        return;
    }

    creep.memory.taskId = assigned.id;

    var handler = taskHandlers[assigned.type];
    if (handler) {
        var keep = handler(creep, assigned);
        if (keep === false) {
            assigned.reservedBy = null;
            creep.memory.taskId = null;
        }
    } else {
        debug(creep.name + ' no handler for ' + assigned.type);
    }
}

function forceTargetFor(creep, room) {
    var role = creep.memory.role;
    if (role === 'miner' || role === 'generalist' || role === 'harvester' || role === 'upgrader' || role === 'builder') {
        var sources = room.find(FIND_SOURCES);
        if (sources.length > 0) {
            return creep.pos.findClosestByPath(sources);
        }
    }
    if (role === 'hauler') {
        var containers = room.find(FIND_STRUCTURES, {
            filter: function (s) { return s.structureType === STRUCTURE_CONTAINER; },
        });
        if (containers.length > 0) {
            return creep.pos.findClosestByPath(containers);
        }
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
