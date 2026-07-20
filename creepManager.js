const taskBase = require('taskBase');
const taskRegistry = require('taskRegistry');
const taskHandlers = require('taskHandlers');
const tasks = require('tasksIndex');
const renew = require('taskRenew');
const logger = require('logger');
const spawnUtil = require('spawnUtil');
const move = require('moveUtil');

const nearestSpawn = spawnUtil.nearestSpawn;

const RENEW_THRESHOLD_SMALL = 150;
const RENEW_THRESHOLD_LARGE = 400;
const STUCK_THRESHOLD = 200;

function renewThresholdFor(creep) {
    return creep.body.length >= 6 ? RENEW_THRESHOLD_LARGE : RENEW_THRESHOLD_SMALL;
}

const RESTRICTED_TASKS = {
    miner:    ['mine'],
    hauler:   ['haul', 'sweep'],
    fighter:  ['defend'],
    healer:   ['heal'],
    builder:  ['build', 'repair', 'upgrade'],
};

let _claimCounts = {};
let _taskListCache = {};

function refreshClaimCounts() {
    _claimCounts = {};
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        const tid = c.memory.taskId;
        if (!tid) continue;
        _claimCounts[tid] = (_claimCounts[tid] || 0) + 1;
    }
}

function getClaimCount(taskId) {
    return _claimCounts[taskId] || 0;
}

function bestTaskFor(creep, taskList, allowed) {
    const needsHarvest = creep.store[RESOURCE_ENERGY] < creep.store.getCapacity();
    const isFull = creep.store[RESOURCE_ENERGY] >= creep.store.getCapacity();
    const candidates = [];
    for (let i = 0; i < taskList.length; i++) {
        const t = taskList[i];
        if (allowed && allowed.indexOf(t.type) === -1) continue;
        if (!tasks.canDo(t.type, creep)) continue;
        const target = t.target;
        if (!target || !target.pos) continue;
        const cap = tasks.cap(t.type);
        if (cap < 99 && getClaimCount(t.id) >= cap) {
            continue;
        }
        if (needsHarvest && (t.type === 'build' || t.type === 'repair' || t.type === 'upgrade')) continue;
        if (isFull && (t.type === 'harvest' || t.type === 'mine')) continue;
        let priority = t.priority;
        if (needsHarvest && t.type === 'harvest') priority = 5;
        if (creep.memory._failedTasks && creep.memory._failedTasks[t.id]) continue;
        const approx = taskBase.approxDistance(creep, target);
        candidates.push({ task: t, priority: priority, approx: approx });
    }
    if (candidates.length === 0) return null;
    candidates.sort(function (a, b) {
        return (a.priority * 1000 + a.approx) - (b.priority * 1000 + b.approx);
    });
    return candidates[0].task;
}

const TASK_SWITCH_COOLDOWN = 5;

function shouldSwitch(creep, current, currentApprox, best) {
    if (best.type === current.type) return false;
    if (best.priority < current.priority) return true;
    if (best.priority > current.priority) return false;
    const lastChange = creep.memory._lastTaskChange || 0;
    if (Game.time - lastChange < TASK_SWITCH_COOLDOWN) return false;
    return best.approx < currentApprox;
}

function inferRoleFromName(name) {
    if (name.indexOf('Miner') === 0) return 'miner';
    if (name.indexOf('Hauler') === 0) return 'hauler';
    if (name.indexOf('Upgrader') === 0) return 'upgrader';
    if (name.indexOf('Builder') === 0) return 'builder';
    if (name.indexOf('Fighter') === 0) return 'fighter';
    if (name.indexOf('Healer') === 0) return 'healer';
    if (name.indexOf('Harvester') === 0) return 'harvester';
    return 'harvester';
}

function runCreep(creep) {
    if (!creep.memory.role) {
        creep.memory.role = inferRoleFromName(creep.name);
    }

    if (creep.ticksToLive < renewThresholdFor(creep)) {
        const renewSpawn = nearestSpawn(creep);
        if (renewSpawn && renewSpawn.energy > 50) {
            renew.run(creep);
            return;
        }
    }

    const room = creep.room;
    if (!room) return;

    if (creep.getActiveBodyparts(MOVE) === 0) {
        logger.event('creep', '[' + Game.time + '] [no-move] ' + creep.name + ' has no MOVE parts; recycling');
        const spawn = nearestSpawn(creep);
        if (spawn && spawn.recycleCreep(creep) === ERR_NOT_IN_RANGE) {
            creep.suicide();
        }
        return;
    }

    if (creep.fatigue > 0 && Memory.flags && Memory.flags.debugStuck) {
        console.log('[stuck] ' + creep.name + ' fatigue=' + creep.fatigue + ' pos=' + creep.pos.x + ',' + creep.pos.y + ' taskId=' + creep.memory.taskId);
    }

    checkStuck(creep);

    if (creep.memory._moveFailures && creep.memory._moveFailures >= move.MOVE_FAIL_THRESHOLD) {
        if (creep.memory.taskId) {
            logger.event('creep', '[' + Game.time + '] [unreachable] ' + creep.name + ' releasing task ' + creep.memory.taskId + ' after ' + creep.memory._moveFailures + ' move failures');
            if (!creep.memory._failedTasks) creep.memory._failedTasks = {};
            creep.memory._failedTasks[creep.memory.taskId] = Game.time + 50;
            creep.memory.taskId = null;
        }
        creep.memory._moveFailures = 0;
    }
    if (creep.memory._failedTasks) {
        const now = Game.time;
        for (const ftk in creep.memory._failedTasks) {
            if (creep.memory._failedTasks[ftk] <= now) delete creep.memory._failedTasks[ftk];
        }
    }

    let taskList = _taskListCache[room.name];
    if (!taskList) {
        taskList = taskRegistry.list(room);
        _taskListCache[room.name] = taskList;
    }
    const allowed = RESTRICTED_TASKS[creep.memory.role];

    let current = null;
    let currentApprox = null;
    if (creep.memory.taskId) {
        for (let i = 0; i < taskList.length; i++) {
            if (taskList[i].id === creep.memory.taskId) {
                current = taskList[i];
                currentApprox = taskBase.approxDistance(creep, current.target);
                break;
            }
        }
        if (!current) {
            creep.memory.taskId = null;
        }
    }
    const best = bestTaskFor(creep, taskList, allowed);
    let assigned = current;
    if (best) {
        if (!current) {
            assigned = best;
        } else if (shouldSwitch(creep, current, currentApprox, best)) {
            assigned = best;
        }
    }
    if (assigned) {
        const prev = creep.memory.taskId;
        if (prev !== assigned.id) {
            logger.event('creep', '[' + Game.time + '] [task] ' + creep.name + ' (' + creep.memory.role + ') -> ' + taskBase.describeTask(assigned));
        }
    }
    if (!assigned) {
        creep.memory.taskId = null;
        creep.memory._lastTaskChange = Game.time;
        const forceTarget = forceTargetFor(creep, room);
        if (forceTarget) {
            if (!creep.pos.isNearTo(forceTarget)) {
                logger.setAction(creep, 'force->' + (forceTarget.id || '?'));
                move.moveCreep(creep, forceTarget, { visualizePathStyle: { stroke: '#ff00ff' }, reusePath: 10 });
            } else {
                logger.setAction(creep, 'force-harvest@' + (forceTarget.id || '?'));
                const ha = creep.harvest(forceTarget);
                if (ha === ERR_NOT_IN_RANGE) {
                    move.moveCreep(creep, forceTarget, { visualizePathStyle: { stroke: '#ff00ff' }, reusePath: 10 });
                }
            }
            return;
        }
        const idleSpawn = nearestSpawn(creep);
        if (idleSpawn && !creep.pos.isNearTo(idleSpawn)) {
            logger.setAction(creep, 'idle->spawn');
            move.moveCreep(creep, idleSpawn, { visualizePathStyle: { stroke: '#888888' }, reusePath: 10 });
        } else {
            logger.setAction(creep, 'idle');
        }
        return;
    }

    const prevTask = creep.memory.taskId;
    creep.memory.taskId = assigned.id;
    if (prevTask !== assigned.id) {
        creep.memory._lastTaskChange = Game.time;
        logger.setAction(creep, assigned.type);
    }

    const keep = taskHandlers.run(assigned.type, creep, assigned);
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
    const lastChange = creep.memory._lastTaskChange || 0;
    if (Game.time - lastChange < STUCK_THRESHOLD) return;
    const spawn = nearestSpawn(creep);
    if (!spawn) return;
    logger.event('stuck', '[' + Game.time + '] [stuck-recycle] ' + creep.name + ' idle for ' + (Game.time - lastChange) + ' ticks');
    if (spawn.recycleCreep(creep) === ERR_NOT_IN_RANGE) {
        move.moveCreep(creep, spawn, { visualizePathStyle: { stroke: '#ff8800' }, reusePath: 10 });
    }
    creep.memory._lastTaskChange = Game.time;
}

function forceTargetFor(creep, room) {
    const sources = room.find(FIND_SOURCES_ACTIVE);
    if (sources.length > 0) {
        return creep.pos.findClosestByPath(sources);
    }
    return null;
}

module.exports = {
    tick: function () {
        refreshClaimCounts();
        _taskListCache = {};

        const byRole = {};
        const byTask = {};
        let total = 0;
        for (const cn in Game.creeps) {
            total++;
            const cr = Game.creeps[cn];
            const r = cr.memory.role || 'unknown';
            byRole[r] = (byRole[r] || 0) + 1;
            const t = cr.memory.taskId;
            if (t) {
                const type = t.split(':')[0];
                byTask[type] = (byTask[type] || 0) + 1;
            } else {
                byTask['idle'] = (byTask['idle'] || 0) + 1;
            }
        }
        const ctrlParts = [];
        for (const rn in Game.rooms) {
            const rm = Game.rooms[rn];
            if (!rm.controller || !rm.controller.my) continue;
            const ctl = rm.controller;
            const ttd = ctl.ticksToDowngrade;
            if (typeof ttd === 'number' && ttd < 5000) {
                ctrlParts.push('ctrl[' + rn + ']=rcl' + ctl.level + ':ttd' + ttd);
            }
        }
        let summary = '[' + Game.time + '] [summary] ' + total + ' creeps | roles=' + JSON.stringify(byRole) + ' | tasks=' + JSON.stringify(byTask);
        if (ctrlParts.length > 0) summary += ' | ' + ctrlParts.join(' ');
        logger.periodic('summary', 50, 'tick', summary);

        if (Game.time % 50 === 0) {
            for (const rname in Game.rooms) {
                const rroom = Game.rooms[rname];
                if (!rroom.controller || !rroom.controller.my) continue;
                const tlist = taskRegistry.list(rroom);
                const tsum = {};
                for (let ti = 0; ti < tlist.length; ti++) {
                    const tt = tlist[ti].type;
                    tsum[tt] = (tsum[tt] || 0) + 1;
                }
                console.log('[' + Game.time + '] [tasklist] ' + rname + ' count=' + tlist.length + ' ' + JSON.stringify(tsum));
            }
        }

        for (const name in Game.creeps) {
            try {
                runCreep(Game.creeps[name]);
            } catch (e) {
                logger.event('error', '[' + Game.time + '] [creepManager] ' + name + ': ' + e);
            }
        }
    },
    runCreep: runCreep,
};
