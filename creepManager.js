var taskBase = require('taskBase');
var taskRegistry = require('taskRegistry');
var taskHandlers = require('taskHandlers');
var tasks = require('tasksIndex');
var renew = require('taskRenew');
var logger = require('logger');
var spawnUtil = require('spawnUtil');

var nearestSpawn = spawnUtil.nearestSpawn;

var RENEW_THRESHOLD = 400;
var STUCK_THRESHOLD = 200;

var RESTRICTED_TASKS = {
    miner:    ['mine'],
    hauler:   ['haul', 'sweep'],
    fighter:  ['defend'],
    healer:   ['heal'],
    builder:  ['build', 'repair', 'upgrade'],
};

var _claimCounts = {};
var _taskListCache = {};

function refreshClaimCounts() {
    _claimCounts = {};
    for (var name in Game.creeps) {
        var c = Game.creeps[name];
        var tid = c.memory.taskId;
        if (!tid) continue;
        _claimCounts[tid] = (_claimCounts[tid] || 0) + 1;
    }
}

function getClaimCount(taskId) {
    return _claimCounts[taskId] || 0;
}

function bestTaskFor(creep, taskList, allowed) {
    var best = null;
    var bestScore = Infinity;
    var needsHarvest = creep.carry.energy === 0;
    var isFull = creep.carry.energy === creep.carryCapacity;
    for (var i = 0; i < taskList.length; i++) {
        var t = taskList[i];
        if (allowed && allowed.indexOf(t.type) === -1) continue;
        if (!tasks.canDo(t.type, creep)) continue;
        var target = t.target;
        if (!target || !target.pos) continue;
        var cap = tasks.cap(t.type);
        if (cap < 99 && getClaimCount(t.id) >= cap) {
            continue;
        }
        if (needsHarvest && (t.type === 'build' || t.type === 'repair' || t.type === 'upgrade')) continue;
        if (isFull && (t.type === 'harvest' || t.type === 'mine')) continue;
        var dist = tasks.score(t.type, creep, target);
        var priority = t.priority;
        if (needsHarvest && t.type === 'harvest') priority = 5;
        var score = priority * 1000 + dist;
        if (score < bestScore) {
            bestScore = score;
            best = t;
        }
    }
    return best;
}

function inferRoleFromName(name) {
    if (name.indexOf('Miner') === 0) return 'miner';
    if (name.indexOf('Hauler') === 0) return 'hauler';
    if (name.indexOf('Upgrader') === 0) return 'upgrader';
    if (name.indexOf('Builder') === 0) return 'builder';
    if (name.indexOf('Fighter') === 0) return 'fighter';
    if (name.indexOf('Healer') === 0) return 'healer';
    if (name.indexOf('Harvester') === 0) return 'generalist';
    return 'generalist';
}

function runCreep(creep) {
    if (!creep.memory.role) {
        creep.memory.role = inferRoleFromName(creep.name);
    }

    if (creep.ticksToLive < RENEW_THRESHOLD) {
        var renewSpawn = nearestSpawn(creep);
        if (renewSpawn && renewSpawn.energy > 50) {
            renew.run(creep);
            return;
        }
    }

    var room = creep.room;
    if (!room) return;

    if (creep.getActiveBodyparts(MOVE) === 0) {
        logger.event('creep', '[' + Game.time + '] [no-move] ' + creep.name + ' has no MOVE parts; recycling');
        var spawn = nearestSpawn(creep);
        if (spawn && spawn.recycleCreep(creep) === ERR_NOT_IN_RANGE) {
            creep.suicide();
        }
        return;
    }

    if (creep.fatigue > 0 && Memory.flags && Memory.flags.debugStuck) {
        console.log('[stuck] ' + creep.name + ' fatigue=' + creep.fatigue + ' pos=' + creep.pos.x + ',' + creep.pos.y + ' taskId=' + creep.memory.taskId);
    }

    checkStuck(creep);

    var taskList = _taskListCache[room.name];
    if (!taskList) {
        taskList = taskRegistry.list(room);
        _taskListCache[room.name] = taskList;
    }
    var allowed = RESTRICTED_TASKS[creep.memory.role];

    var assigned = null;
    if (creep.memory.taskId) {
        for (var i = 0; i < taskList.length; i++) {
            if (taskList[i].id === creep.memory.taskId) {
                assigned = taskList[i];
                break;
            }
        }
        if (!assigned) {
            creep.memory.taskId = null;
        }
    }
    if (!assigned) {
        assigned = bestTaskFor(creep, taskList, allowed);
        if (assigned) {
            var prev = creep.memory.taskId;
            if (prev !== assigned.id) {
                logger.event('creep', '[' + Game.time + '] [task] ' + creep.name + ' (' + creep.memory.role + ') -> ' + taskBase.describeTask(assigned));
            }
        }
    }
    if (!assigned) {
        creep.memory.taskId = null;
        creep.memory._lastTaskChange = Game.time;
        var forceTarget = forceTargetFor(creep, room);
        if (forceTarget) {
            if (!creep.pos.isNearTo(forceTarget)) {
                logger.setAction(creep, 'force->' + (forceTarget.id || '?'));
                var r2 = creep.moveTo(forceTarget, { visualizePathStyle: { stroke: '#ff00ff' }, reusePath: 10 });
                if (r2 !== OK && r2 !== ERR_TIRED) {
                    logger.event('stuck', '[' + Game.time + '] [stuck] ' + creep.name + ' force moveTo ' + forceTarget.id + ' -> ' + r2);
                }
            } else {
                logger.setAction(creep, 'force-harvest@' + (forceTarget.id || '?'));
                var ha = creep.harvest(forceTarget);
                if (ha === ERR_NOT_IN_RANGE) {
                    creep.moveTo(forceTarget, { visualizePathStyle: { stroke: '#ff00ff' }, reusePath: 10 });
                }
            }
            return;
        }
        var idleSpawn = nearestSpawn(creep);
        if (idleSpawn && !creep.pos.isNearTo(idleSpawn)) {
            logger.setAction(creep, 'idle->spawn');
            creep.moveTo(idleSpawn, { visualizePathStyle: { stroke: '#888888' }, reusePath: 10 });
        } else {
            logger.setAction(creep, 'idle');
        }
        return;
    }

    var prevTask = creep.memory.taskId;
    creep.memory.taskId = assigned.id;
    if (prevTask !== assigned.id) {
        creep.memory._lastTaskChange = Game.time;
        logger.setAction(creep, assigned.type);
    }

    var keep = taskHandlers.run(assigned.type, creep, assigned);
    if (keep === false) {
        logger.event('creep', '[' + Game.time + '] [release] ' + creep.name + ' finished ' + taskBase.describeTask(assigned));
        creep.memory.taskId = null;
        creep.memory._lastTaskChange = Game.time;
        logger.setAction(creep, 'released');
    }

    logger.periodic('status', 25, creep.name, '[' + Game.time + '] [status] ' + logger.statusLine(creep));
}

function checkStuck(creep) {
    if (!Memory.flags || !Memory.flags.stuckRecycle) return;
    var lastChange = creep.memory._lastTaskChange || 0;
    if (Game.time - lastChange < STUCK_THRESHOLD) return;
    var spawn = nearestSpawn(creep);
    if (!spawn) return;
    logger.event('stuck', '[' + Game.time + '] [stuck-recycle] ' + creep.name + ' idle for ' + (Game.time - lastChange) + ' ticks');
    if (spawn.recycleCreep(creep) === ERR_NOT_IN_RANGE) {
        creep.moveTo(spawn, { visualizePathStyle: { stroke: '#ff8800' }, reusePath: 10 });
    }
    creep.memory._lastTaskChange = Game.time;
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

module.exports = {
    tick: function () {
        refreshClaimCounts();
        _taskListCache = {};

        var byRole = {};
        var byTask = {};
        var total = 0;
        for (var cn in Game.creeps) {
            total++;
            var cr = Game.creeps[cn];
            var r = cr.memory.role || 'unknown';
            byRole[r] = (byRole[r] || 0) + 1;
            var t = cr.memory.taskId;
            if (t) {
                var type = t.split(':')[0];
                byTask[type] = (byTask[type] || 0) + 1;
            } else {
                byTask['idle'] = (byTask['idle'] || 0) + 1;
            }
        }
        var ctrlParts = [];
        for (var rn in Game.rooms) {
            var rm = Game.rooms[rn];
            if (!rm.controller || !rm.controller.my) continue;
            var ctl = rm.controller;
            var ttd = ctl.ticksToDowngrade;
            if (typeof ttd === 'number' && ttd < 5000) {
                ctrlParts.push('ctrl[' + rn + ']=rcl' + ctl.level + ':ttd' + ttd);
            }
        }
        var summary = '[' + Game.time + '] [summary] ' + total + ' creeps | roles=' + JSON.stringify(byRole) + ' | tasks=' + JSON.stringify(byTask);
        if (ctrlParts.length > 0) summary += ' | ' + ctrlParts.join(' ');
        logger.periodic('summary', 50, 'tick', summary);

        for (var name in Game.creeps) {
            try {
                runCreep(Game.creeps[name]);
            } catch (e) {
                logger.event('error', '[' + Game.time + '] [creepManager] ' + name + ': ' + e);
            }
        }
    },
    runCreep: runCreep,
};
