var taskBase = require('taskBase');
var taskRegistry = require('taskRegistry');
var taskHandlers = require('taskHandlers');
var renew = require('taskRenew');

var RENEW_THRESHOLD = 400;

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
        var dist = creep.pos.findPathTo(target.pos).length;
        if (dist === 0) dist = 1;
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
    }
    if (!assigned) {
        assigned = bestTaskFor(creep, tasks, allowed);
    }
    if (!assigned) {
        if (allowed && allowed.length === 1 && allowed[0] === 'mine' && creep.memory.sourceId) {
            return;
        }
        if (!creep.pos.isNearTo(Game.spawns['Spawn1'])) {
            taskBase.moveCreep(creep, Game.spawns['Spawn1'], { visualizePathStyle: { stroke: '#888888' } });
        }
        creep.memory.taskId = null;
        return;
    }

    if (!assigned.reservedBy) {
        assigned.reservedBy = creep.name;
    }
    creep.memory.taskId = assigned.id;

    var handler = taskHandlers[assigned.type];
    if (handler) {
        var keep = handler(creep, assigned);
        if (keep === false) {
            assigned.reservedBy = null;
            creep.memory.taskId = null;
        }
    }
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
