const taskBase = require('taskBase');
const taskRegistry = require('taskRegistry');
const taskHandlers = require('taskHandlers');
const tasks = require('tasksIndex');
const renew = require('taskRenew');
const logger = require('logger');
const spawnUtil = require('spawnUtil');
const move = require('moveUtil');
const roomManager = require('roomManager');

const nearestSpawn = spawnUtil.nearestSpawn;

const RENEW_THRESHOLD_SMALL = 150;
const RENEW_THRESHOLD_LARGE = 400;
const STUCK_THRESHOLD = 200;

function renewThresholdFor(creep) {
    return creep.body.length >= 6 ? RENEW_THRESHOLD_LARGE : RENEW_THRESHOLD_SMALL;
}

function shouldRenew(creep) {
    if (creep.ticksToLive >= renewThresholdFor(creep)) return false;
    const used = creep.store.getUsedCapacity(RESOURCE_ENERGY);
    if (used === 0) return true;
    if (creep.memory.role === 'miner') return true;
    return false;
}

const RESTRICTED_TASKS = {
    miner:    { mine: true },
    hauler:   { haul: true, sweep: true, supply: true },
    fighter:  { defend: true },
    healer:   { heal: true },
    builder:  { build: true, repair: true, upgrade: true },
    upgrader: { upgrade: true, harvest: true },
};

let _claimCounts = {};
let _taskListCache = {};
let _capCache = {};

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

function capForType(type, room, snap) {
    const key = type + ':' + room.name;
    if (_capCache[key] === undefined) {
        _capCache[key] = tasks.cap(type, room, snap);
    }
    return _capCache[key];
}

const SELF_REFUELING_TASKS = { build: true, repair: true, upgrade: true };

function depositAvailable(snap, excludeContainerId) {
    if (!snap) return false;
    if (snap.energyStructures) {
        for (let i = 0; i < snap.energyStructures.length; i++) {
            const s = snap.energyStructures[i];
            if (s.structureType === STRUCTURE_TOWER) continue;
            const cap = s.store.getCapacity(RESOURCE_ENERGY) || 0;
            if ((s.store[RESOURCE_ENERGY] || 0) < cap) return true;
        }
    }
    if (snap.storage) {
        const cap = snap.storage.store.getCapacity(RESOURCE_ENERGY) || 0;
        if ((snap.storage.store[RESOURCE_ENERGY] || 0) < cap) return true;
    }
    if (snap.containers) {
        for (let i = 0; i < snap.containers.length; i++) {
            const c = snap.containers[i];
            if (c.id === excludeContainerId) continue;
            const cap = c.store.getCapacity(RESOURCE_ENERGY) || 0;
            if ((c.store[RESOURCE_ENERGY] || 0) < cap) return true;
        }
    }
    return false;
}

function bestTaskFor(creep, taskList, allowed, snap) {
    const capacity = creep.store.getCapacity(RESOURCE_ENERGY);
    const energy = creep.store[RESOURCE_ENERGY] || 0;
    const isFull = energy >= capacity;
    const isEmpty = energy === 0;
    const candidates = [];
    for (let i = 0; i < taskList.length; i++) {
        const t = taskList[i];
        if (allowed && !allowed[t.type]) continue;
        if (!tasks.canDo(t.type, creep)) continue;
        const target = t.target;
        if (!target || !target.pos) continue;
        const cap = capForType(t.type, creep.room, snap);
        if (cap < 99 && getClaimCount(t.id) >= cap) {
            continue;
        }
        if (isFull && (t.type === 'harvest' || t.type === 'mine')) continue;
        if (isFull && t.type === 'haul') {
            const excludeId = (creep.memory._hauledFrom === target.id) ? target.id : null;
            if (!depositAvailable(snap, excludeId)) continue;
        }
        if (isEmpty && !SELF_REFUELING_TASKS[t.type] && t.type !== 'harvest' && t.type !== 'sweep' && t.type !== 'haul') continue;
        if (creep.memory._failedTasks && creep.memory._failedTasks[t.id]) continue;
        let priority = t.priority;
        if (isEmpty && t.type === 'harvest') priority = 5;
        const approx = taskBase.approxDistance(creep, target);
        candidates.push({ task: t, priority: priority, approx: approx });
    }
    if (candidates.length === 0) return null;
    let best = candidates[0];
    let bestScore = best.priority * 1000 + best.approx;
    for (let i = 1; i < candidates.length; i++) {
        const c = candidates[i];
        const score = c.priority * 1000 + c.approx;
        if (score < bestScore) {
            bestScore = score;
            best = c;
        }
    }
    return best;
}

const TASK_SWITCH_COOLDOWN = 5;

function shouldSwitch(creep, current, currentApprox, best) {
    const bestTask = best.task;
    if (bestTask.id === current.id) return false;
    if (bestTask.type === current.type) return false;
    if (current.type === 'harvest') {
        const capacity = creep.store.getCapacity(RESOURCE_ENERGY) || 0;
        const energy = creep.store[RESOURCE_ENERGY] || 0;
        if (energy < capacity) return false;
    }
    if (best.priority < current.priority) {
        const energy = creep.store[RESOURCE_ENERGY] || 0;
        if (energy === 0 && SELF_REFUELING_TASKS[current.type]) return false;
        return true;
    }
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

    if (shouldRenew(creep)) {
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

    if (checkStuck(creep)) return;

    if (creep.memory._moveFailures && creep.memory._moveFailures >= move.MOVE_FAIL_THRESHOLD) {
        if (creep.memory.taskId) {
            const parts = creep.memory.taskId.split(':');
            const taskType = parts[0];
            const targetId = parts[2];
            const liveTarget = targetId ? Game.getObjectById(targetId) : null;
            const nearTarget = liveTarget && creep.pos.inRangeTo(liveTarget, 3);
            if (taskType === 'harvest' && nearTarget) {
                creep.memory._moveFailures = 0;
            } else {
                logger.event('creep', '[' + Game.time + '] [unreachable] ' + creep.name + ' releasing task ' + creep.memory.taskId + ' after ' + creep.memory._moveFailures + ' move failures');
                if (!creep.memory._failedTasks) creep.memory._failedTasks = {};
                creep.memory._failedTasks[creep.memory.taskId] = Game.time + 50;
                if (_claimCounts[creep.memory.taskId]) _claimCounts[creep.memory.taskId] = Math.max(0, _claimCounts[creep.memory.taskId] - 1);
                creep.memory.taskId = null;
            }
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
    const snap = roomManager.get(room.name);
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
            if (_claimCounts[creep.memory.taskId]) _claimCounts[creep.memory.taskId] = Math.max(0, _claimCounts[creep.memory.taskId] - 1);
            creep.memory.taskId = null;
        }
    }
    const best = bestTaskFor(creep, taskList, allowed, snap);
    let assigned = current;
    if (best) {
        if (!current) {
            assigned = best.task;
        } else if (shouldSwitch(creep, current, currentApprox, best)) {
            assigned = best.task;
        }
    }
    if (assigned) {
        const prev = creep.memory.taskId;
        if (prev !== assigned.id) {
            logger.event('creep', '[' + Game.time + '] [task] ' + creep.name + ' (' + creep.memory.role + ') -> ' + taskBase.describeTask(assigned));
        }
    }
    if (!assigned) {
        if (creep.memory.taskId) {
            if (_claimCounts[creep.memory.taskId]) _claimCounts[creep.memory.taskId] = Math.max(0, _claimCounts[creep.memory.taskId] - 1);
            creep.memory.taskId = null;
        }
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
        if (prevTask) _claimCounts[prevTask] = Math.max(0, (_claimCounts[prevTask] || 1) - 1);
        _claimCounts[assigned.id] = (_claimCounts[assigned.id] || 0) + 1;
    }

    const keep = taskHandlers.run(assigned.type, creep, assigned);
    if (keep === false) {
        logger.event('creep', '[' + Game.time + '] [release] ' + creep.name + ' finished ' + taskBase.describeTask(assigned));
        creep.memory.taskId = null;
        creep.memory._lastTaskChange = Game.time;
        if (_claimCounts[assigned.id]) _claimCounts[assigned.id] = Math.max(0, _claimCounts[assigned.id] - 1);
        logger.setAction(creep, 'released');
    }

    logger.periodic('status', 25, creep.name, '[' + Game.time + '] [status] ' + logger.statusLine(creep));
}

function checkStuck(creep) {
    if (!Memory.flags || !Memory.flags.stuckRecycle) return false;
    const lastChange = creep.memory._lastTaskChange || 0;
    if (Game.time - lastChange < STUCK_THRESHOLD) return false;
    const spawn = nearestSpawn(creep);
    if (!spawn) return false;
    logger.event('stuck', '[' + Game.time + '] [stuck-recycle] ' + creep.name + ' idle for ' + (Game.time - lastChange) + ' ticks');
    if (spawn.recycleCreep(creep) === ERR_NOT_IN_RANGE) {
        move.moveCreep(creep, spawn, { visualizePathStyle: { stroke: '#ff8800' }, reusePath: 10 });
    }
    creep.memory._lastTaskChange = Game.time;
    return true;
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
        _capCache = {};

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

        for (const name in Game.creeps) {
            try {
                runCreep(Game.creeps[name]);
            } catch (e) {
                logger.event('error', '[' + Game.time + '] [creepManager] ' + name + ': ' + e);
                const failed = Game.creeps[name];
                if (failed && failed.memory && failed.memory.taskId) {
                    const tid = failed.memory.taskId;
                    if (_claimCounts[tid]) _claimCounts[tid] = Math.max(0, _claimCounts[tid] - 1);
                    failed.memory.taskId = null;
                }
            }
        }

        if (Game.time % 50 === 0) {
            for (const rname in Game.rooms) {
                const rroom = Game.rooms[rname];
                if (!rroom.controller || !rroom.controller.my) continue;
                const tlist = _taskListCache[rname] || taskRegistry.list(rroom);
                const tsum = {};
                for (let ti = 0; ti < tlist.length; ti++) {
                    const tt = tlist[ti].type;
                    tsum[tt] = (tsum[tt] || 0) + 1;
                }
                console.log('[' + Game.time + '] [tasklist] ' + rname + ' count=' + tlist.length + ' ' + JSON.stringify(tsum));
            }
        }
    },
    runCreep: runCreep,
};
