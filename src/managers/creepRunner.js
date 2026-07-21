const constants = require('../config/constants');
const roles = require('../config/roles');
const memory = require('../utils/memorySchema');
const taskBase = require('../tasks/taskBase');
const tasks = require('../tasks/tasksIndex');
const taskRegistry = require('../tasks/taskRegistry');
const renew = require('../tasks/types/taskRenew');
const logger = require('../utils/logger');
const spawnUtil = require('../utils/spawnUtil');
const move = require('../utils/moveUtil');
const roomManager = require('./roomManager');

const RENEW_THRESHOLD_SMALL = constants.RENEW_THRESHOLD_SMALL;
const RENEW_THRESHOLD_LARGE = constants.RENEW_THRESHOLD_LARGE;
const STUCK_THRESHOLD = constants.STUCK_THRESHOLD;
const TASK_SWITCH_COOLDOWN = constants.TASK_SWITCH_COOLDOWN;
const MOVE_FAIL_THRESHOLD = move.MOVE_FAIL_THRESHOLD;

const SELF_REFUELING_TASKS = { build: true, repair: true, upgrade: true };

function renewThresholdFor(creep) {
    return creep.body.length >= 6 ? RENEW_THRESHOLD_LARGE : RENEW_THRESHOLD_SMALL;
}

function shouldRenew(creep) {
    if (creep.ticksToLive >= renewThresholdFor(creep)) return false;
    const used = creep.store.getUsedCapacity(RESOURCE_ENERGY);
    if (used === 0) return true;
    if (memory.getRole(creep) === 'miner') return true;
    return false;
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

function forceTargetFor(creep, room) {
    const sources = room.find(FIND_SOURCES_ACTIVE);
    if (sources.length > 0) {
        return creep.pos.findClosestByPath(sources);
    }
    return null;
}

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

function capForType(type, room, snap, capCache) {
    const key = type + ':' + room.name;
    if (capCache[key] === undefined) {
        capCache[key] = tasks.cap(type, room, snap);
    }
    return capCache[key];
}

function bestTaskFor(creep, taskList, allowed, snap, claimCounts, capCache) {
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
        const cap = capForType(t.type, creep.room, snap, capCache);
        if (cap < 99 && (claimCounts[t.id] || 0) >= cap) continue;
        if (isFull && (t.type === 'harvest' || t.type === 'mine')) continue;
        if (isFull && t.type === 'haul') {
            const excludeId = (memory.getHauledFrom(creep) === target.id) ? target.id : null;
            if (!depositAvailable(snap, excludeId)) continue;
        }
        if (isEmpty && !SELF_REFUELING_TASKS[t.type] && t.type !== 'harvest' && t.type !== 'sweep' && t.type !== 'haul') continue;
        const failedTasks = memory.getFailedTasks(creep);
        if (failedTasks[t.id]) continue;
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
    const lastChange = memory.getLastTaskChange(creep);
    if (Game.time - lastChange < TASK_SWITCH_COOLDOWN) return false;
    return best.approx < currentApprox;
}

function findCurrentTask(taskList, taskId) {
    for (let i = 0; i < taskList.length; i++) {
        if (taskList[i].id === taskId) return taskList[i];
    }
    return null;
}

function selectTask(creep, taskList, allowed, snap, currentTask, claimCounts, capCache) {
    const currentApprox = currentTask ? taskBase.approxDistance(creep, currentTask.target) : null;
    const best = bestTaskFor(creep, taskList, allowed, snap, claimCounts, capCache);
    let assigned = currentTask;
    if (best) {
        if (!currentTask) {
            assigned = best.task;
        } else if (shouldSwitch(creep, currentTask, currentApprox, best)) {
            assigned = best.task;
        }
    }
    return assigned;
}

function releaseTask(creep, claimCounts) {
    const tid = memory.getTaskId(creep);
    if (!tid) return;
    if (claimCounts[tid]) claimCounts[tid] = Math.max(0, claimCounts[tid] - 1);
    memory.clearTaskId(creep);
}

function applyTaskAssignment(creep, assigned, claimCounts) {
    const prev = memory.getTaskId(creep);
    if (prev !== assigned.id) {
        logger.event('creep', '[' + Game.time + '] [task] ' + creep.name + ' (' + memory.getRole(creep) + ') -> ' + taskBase.describeTask(assigned));
        memory.setTaskId(creep, assigned.id);
        memory.setLastTaskChange(creep, Game.time);
        logger.setAction(creep, assigned.type);
        if (prev) claimCounts[prev] = Math.max(0, (claimCounts[prev] || 1) - 1);
        claimCounts[assigned.id] = (claimCounts[assigned.id] || 0) + 1;
    }
}

function renewOrRecycle(creep) {
    if (creep.getActiveBodyparts(MOVE) === 0) {
        logger.event('creep', '[' + Game.time + '] [no-move] ' + creep.name + ' has no MOVE parts; recycling');
        const spawn = spawnUtil.nearestSpawn(creep);
        if (spawn && spawn.recycleCreep(creep) === ERR_NOT_IN_RANGE) {
            creep.suicide();
        }
        return true;
    }
    if (shouldRenew(creep)) {
        const renewSpawn = spawnUtil.nearestSpawn(creep);
        if (renewSpawn && renewSpawn.energy > 50) {
            renew.run(creep);
            return true;
        }
    }
    return false;
}

function checkStuck(creep) {
    if (!Memory.flags || !Memory.flags.stuckRecycle) return false;
    const lastChange = memory.getLastTaskChange(creep);
    if (Game.time - lastChange < STUCK_THRESHOLD) return false;
    const spawn = spawnUtil.nearestSpawn(creep);
    if (!spawn) return false;
    logger.event('stuck', '[' + Game.time + '] [stuck-recycle] ' + creep.name + ' idle for ' + (Game.time - lastChange) + ' ticks');
    if (spawn.recycleCreep(creep) === ERR_NOT_IN_RANGE) {
        move.moveCreep(creep, spawn, { visualizePathStyle: { stroke: '#ff8800' }, reusePath: 10 });
    }
    memory.setLastTaskChange(creep, Game.time);
    return true;
}

function handleMoveFailures(creep, claimCounts) {
    if (memory.getMoveFailures(creep) < MOVE_FAIL_THRESHOLD) return false;
    const taskId = memory.getTaskId(creep);
    if (taskId) {
        const parts = taskId.split(':');
        const taskType = parts[0];
        const targetId = parts[2];
        const liveTarget = targetId ? Game.getObjectById(targetId) : null;
        const nearTarget = liveTarget && creep.pos.inRangeTo(liveTarget, 3);
        if (taskType === 'harvest' && nearTarget) {
            memory.setMoveFailures(creep, 0);
        } else {
            logger.event('creep', '[' + Game.time + '] [unreachable] ' + creep.name + ' releasing task ' + taskId + ' after ' + memory.getMoveFailures(creep) + ' move failures');
            memory.addFailedTask(creep, taskId, 50);
            releaseTask(creep, claimCounts);
        }
    }
    memory.setMoveFailures(creep, 0);
    return true;
}

function runIdleFallback(creep, room) {
    memory.setLastTaskChange(creep, Game.time);
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
    const idleSpawn = spawnUtil.nearestSpawn(creep);
    if (idleSpawn && !creep.pos.isNearTo(idleSpawn)) {
        logger.setAction(creep, 'idle->spawn');
        move.moveCreep(creep, idleSpawn, { visualizePathStyle: { stroke: '#888888' }, reusePath: 10 });
    } else {
        logger.setAction(creep, 'idle');
    }
}

function runCreep(creep, context) {
    if (!memory.getRole(creep)) {
        memory.setRole(creep, inferRoleFromName(creep.name));
    }
    if (renewOrRecycle(creep)) return;

    const room = creep.room;
    if (!room) return;

    if (creep.fatigue > 0 && Memory.flags && Memory.flags.debugStuck) {
        console.log('[stuck] ' + creep.name + ' fatigue=' + creep.fatigue + ' pos=' + creep.pos.x + ',' + creep.pos.y + ' taskId=' + memory.getTaskId(creep));
    }
    if (checkStuck(creep)) return;

    handleMoveFailures(creep, context.claimCounts);
    memory.cleanupFailedTasks(creep);

    let taskList = context.taskListCache[room.name];
    if (!taskList) {
        taskList = taskRegistry.list(room);
        context.taskListCache[room.name] = taskList;
    }

    const snap = roomManager.get(room.name);
    const allowed = roles.allowedSet(memory.getRole(creep));
    const currentTaskId = memory.getTaskId(creep);
    let currentTask = null;
    if (currentTaskId) {
        currentTask = findCurrentTask(taskList, currentTaskId);
        if (!currentTask) {
            releaseTask(creep, context.claimCounts);
        }
    }

    const assigned = selectTask(creep, taskList, allowed, snap, currentTask, context.claimCounts, context.capCache);
    if (!assigned) {
        releaseTask(creep, context.claimCounts);
        runIdleFallback(creep, room);
        logger.periodic('status', 25, creep.name, '[' + Game.time + '] [status] ' + logger.statusLine(creep));
        return;
    }

    applyTaskAssignment(creep, assigned, context.claimCounts);

    const keep = tasks.run(assigned.type, creep, assigned, snap);
    if (keep === false) {
        logger.event('creep', '[' + Game.time + '] [release] ' + creep.name + ' finished ' + taskBase.describeTask(assigned));
        releaseTask(creep, context.claimCounts);
        memory.setLastTaskChange(creep, Game.time);
        logger.setAction(creep, 'released');
    }

    logger.periodic('status', 25, creep.name, '[' + Game.time + '] [status] ' + logger.statusLine(creep));
}

module.exports = {
    runCreep: runCreep,
    releaseTask: releaseTask,
    inferRoleFromName: inferRoleFromName,
};
