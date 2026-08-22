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
const sourceRegistry = require('../economy/sourceRegistry');
const bodies = require('../economy/creepsBodies');
const roomFlags = require('../utils/roomFlags');
const depositService = require('../services/depositService');

const RENEW_THRESHOLD_SMALL = constants.RENEW_THRESHOLD_SMALL;
const RENEW_THRESHOLD_LARGE = constants.RENEW_THRESHOLD_LARGE;
const RENEW_FINISH_TTL = 1400;
const TASK_SWITCH_COOLDOWN = constants.TASK_SWITCH_COOLDOWN;
const MOVE_FAIL_THRESHOLD = move.MOVE_FAIL_THRESHOLD;

const SELF_REFUELING_TASKS = { build: true, repair: true, upgrade: true };

function renewThresholdFor(creep) {
    return creep.body.length >= 12 ? RENEW_THRESHOLD_LARGE : RENEW_THRESHOLD_SMALL;
}

function obsoleteRecycleEnabled() {
    return !!(Memory.flags && Memory.flags.obsoleteRecycle);
}

let _obsoleteTick = -1;
let _obsoleteCache = {};
function isObsolete(creep) {
    if (_obsoleteTick !== Game.time) { _obsoleteTick = Game.time; _obsoleteCache = {}; }
    const name = creep.name;
    if (_obsoleteCache[name] !== undefined) return _obsoleteCache[name];
    const role = memory.getRole(creep);
    let result = false;
    if (role !== 'fighter' && role !== 'healer') {
        const spawn = spawnUtil.nearestSpawn(creep);
        if (spawn) {
            const cap = spawn.room.energyCapacityAvailable;
            const target = bodies.bestBodyForAvailable(role, cap, cap);
            if (target && bodies.bodyCostOfCreep(creep) < target.cost) result = true;
        }
    }
    _obsoleteCache[name] = result;
    return result;
}

let _recRoleTick = -1;
let _recRoleCache = {};
function recyclingRoles() {
    if (_recRoleTick !== Game.time) {
        _recRoleTick = Game.time;
        _recRoleCache = {};
        // Count creeps already mid obsolete-recycle (flagged on a previous tick,
        // still walking to the spawn) so the one-per-role limit holds across ticks.
        for (const name in Game.creeps) {
            const c = Game.creeps[name];
            if (memory.getObsoleteRecycling(c)) _recRoleCache[memory.getRole(c)] = true;
        }
    }
    return _recRoleCache;
}

function shouldRecycleObsolete(creep) {
    if (!obsoleteRecycleEnabled()) return false;
    if (!isObsolete(creep)) return false;
    if (creep.ticksToLive >= renewThresholdFor(creep)) return false;
    const used = creep.store.getUsedCapacity(RESOURCE_ENERGY);
    if (used > 0 && memory.getRole(creep) !== 'miner') return false; // don't waste a full load
    if (recyclingRoles()[memory.getRole(creep)]) return false;       // one per role at a time
    return true;
}

function shouldRenew(creep) {
    if (memory.getRole(creep) === 'miner') {
        // Miners work at fixed positions far from spawn. The renew round-trip
        // (walk + renew + walk back) costs far more mining time than letting
        // the miner die at the source and pre-spawning a replacement. See
        // PRE_SPAWN_TTL in spawnManager.creepCountByRole.
        memory.clearRenewing(creep);
        return false;
    }
    if (obsoleteRecycleEnabled() && isObsolete(creep)) {
        // Obsolete creeps are replaced, not kept alive. Clear any in-progress
        // renew so the creep goes back to work until its end-of-life recycle.
        memory.clearRenewing(creep);
        return false;
    }
    const isRenewing = memory.getRenewing(creep);
    if (isRenewing) {
        // Once a creep has committed to renewing, keep it at the spawn until it
        // is nearly topped off, so it does not leave with only a small extension.
        if (creep.ticksToLive >= RENEW_FINISH_TTL) {
            memory.clearRenewing(creep);
            return false;
        }
        return true;
    }
    if (creep.ticksToLive >= renewThresholdFor(creep)) return false;
    const used = creep.store.getUsedCapacity(RESOURCE_ENERGY);
    if (used === 0) return true;
    return false;
}

function inferRoleFromName(name) {
    if (name.indexOf('Miner') === 0) return 'miner';
    if (name.indexOf('Hauler') === 0) return 'hauler';
    if (name.indexOf('Distributor') === 0) return 'distributor';
    if (name.indexOf('Upgrader') === 0) return 'upgrader';
    if (name.indexOf('Builder') === 0) return 'builder';
    if (name.indexOf('Fighter') === 0) return 'fighter';
    if (name.indexOf('Healer') === 0) return 'healer';
    if (name.indexOf('Harvester') === 0) return 'harvester';
    return 'harvester';
}

function forceTargetFor(creep, room) {
    // Only force-harvest in rooms we own. Otherwise a full creep in a
    // foreign room would latch onto a foreign source, fill up with no
    // way to deposit, and get stranded there.
    if (!room.controller || !room.controller.my) return null;
    // Only creeps with WORK parts can actually harvest. A CARRY-only
    // hauler sent to a source just parks on a source-adjacent tile and
    // blocks miner slots while harvesting nothing.
    if (creep.getActiveBodyparts(WORK) === 0) return null;
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

function filterByRole(taskList, role) {
    const allowed = roles.allowedSet(role);
    if (!allowed) return taskList;
    const out = [];
    for (let i = 0; i < taskList.length; i++) {
        const t = taskList[i];
        if (allowed[t.type]) out.push(t);
    }
    return out;
}

function bestTaskFor(creep, taskList, snap, claimCounts, capCache) {
    const capacity = creep.store.getCapacity(RESOURCE_ENERGY) || 0;
    const energy = creep.store[RESOURCE_ENERGY] || 0;
    const isFull = capacity > 0 && energy >= capacity;
    // A creep with no CARRY (capacity 0) is never "empty" — it has no carry
    // to be empty. Without this guard, fighters/healers (no CARRY parts) are
    // permanently isEmpty=true, which skips `defend`/`heal` tasks via the
    // filter below (they aren't in the self-refueling/harvest/sweep/haul/mine/
    // supply exclusion list). The fighters then fall through to
    // combatIdleFallback, which calls move.moveCreep toward the hostile but
    // never creep.attack() — so they spawn, walk up to the attacker, and
    // never swing. Mirrors the isFull guard on the previous line.
    const isEmpty = capacity > 0 && energy === 0;
    const candidates = [];
    for (let i = 0; i < taskList.length; i++) {
        const t = taskList[i];
        if (!tasks.canDo(t.type, creep)) continue;
        const target = t.target;
        if (!target || !target.pos) continue;
        const cap = capForType(t.type, creep.room, snap, capCache);
        if (cap < 99 && (claimCounts[t.id] || 0) >= cap) continue;
        if (isFull && (t.type === 'harvest' || t.type === 'mine' || t.type === 'remoteHarvest')) continue;
        if (isFull && t.type === 'haul') {
            const excludeId = (memory.getHauledFrom(creep) === target.id) ? target.id : null;
            if (!depositAvailable(snap, excludeId)) continue;
        }
        if (isEmpty && !SELF_REFUELING_TASKS[t.type] &&
            t.type !== 'harvest' && t.type !== 'sweep' && t.type !== 'haul' && t.type !== 'mine' && t.type !== 'supply' && t.type !== 'distribute') continue;
        const failedTasks = memory.getFailedTasks(creep);
        if (failedTasks[t.id]) continue;
        let priority = t.priority;
        if (isEmpty && t.type === 'harvest') priority = 5;
        // Use task-specific scoring when available so task types can weight
        // distance against target state (e.g. haul prefers fuller containers).
        const score = tasks.score(t.type, creep, target);
        candidates.push({ task: t, priority: priority, approx: score });
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
    if (current.type === 'harvest') {
        const capacity = creep.store.getCapacity(RESOURCE_ENERGY) || 0;
        const energy = creep.store[RESOURCE_ENERGY] || 0;
        if (energy < capacity) return false;
    }
    if (best.priority < current.priority) {
        // A hauler/sweeper carrying energy must deliver it before switching
        // to any other task — no point chasing a sweep pile or a different
        // haul source with a full tank.
        if ((current.type === 'haul' || current.type === 'sweep') &&
            (creep.store[RESOURCE_ENERGY] || 0) > 0) {
            return false;
        }
        // Empty builders/repairers/upgraders should still switch to combat,
        // critical supply, or emergency upgrade to defend the room. The
        // `defend` early-exit was previously listed separately but is redundant
        // with the `best.priority <= SUPPLY` clause below (DEFEND is priority 10,
        // SUPPLY is 35). Heal is priority 30 — also covered by `<= SUPPLY` — so
        // the separate `!== 'heal'` check is kept because healers should switch
        // to healing even when empty (heal doesn't require energy). Only
        // supply/upgrade are gated because those are self-refueling tasks an
        // empty creep can't perform.
        const energy = creep.store[RESOURCE_ENERGY] || 0;
        if (energy === 0 && SELF_REFUELING_TASKS[current.type] &&
            bestTask.type !== 'heal' &&
            !(bestTask.type === 'supply' && best.priority <= taskBase.PRIORITY.SUPPLY) &&
            !(bestTask.type === 'upgrade' && best.priority <= taskBase.PRIORITY.SUPPLY)) {
            return false;
        }
        return true;
    }
    if (best.priority > current.priority) return false;
    const lastChange = memory.getLastTaskChange(creep);
    if (Game.time - lastChange < TASK_SWITCH_COOLDOWN) return false;
    // Collection/delivery tasks (haul/sweep) must beat current by a score
    // margin. The score now includes target state (e.g. haul energy amount),
    // so keep a smaller margin to avoid lock-in while still preventing rapid
    // target flipping.
    if (current.type === 'haul' || current.type === 'sweep') {
        // Don't switch haul/sweep targets mid-load — a creep that has already
        // collected partial energy should deliver it, not chase a better source.
        const carried = creep.store[RESOURCE_ENERGY] || 0;
        if (carried > 0) return false;
        return best.approx <= currentApprox - 3;
    }
    return best.approx < currentApprox;
}

function findCurrentTask(taskList, taskId, taskIndex) {
    if (taskIndex) {
        return taskIndex[taskId] || null;
    }
    // Linear-scan fallback for task lists without an index (e.g. the small
    // combat task list, which bypasses the room taskListCache).
    for (let i = 0; i < taskList.length; i++) {
        if (taskList[i].id === taskId) return taskList[i];
    }
    return null;
}

function selectTask(creep, taskList, snap, currentTask, claimCounts, capCache) {
    // Score the current task with the same metric bestTaskFor uses for
    // candidates (tasks.score, not raw approxDistance). For mine this
    // includes the per-source claims penalty, so a miner already on a
    // crowded source can fairly compare switching to an empty one.
    // Without this, currentApprox was raw chebyshev distance while
    // best.approx was the scored value, so shouldSwitch never let the
    // spread penalty take effect — miners stacked on one source.
    const currentApprox = currentTask ? tasks.score(currentTask.type, creep, currentTask.target) : null;
    const best = bestTaskFor(creep, taskList, snap, claimCounts, capCache);
    let assigned = currentTask;
    if (best) {
        if (!currentTask) {
            // A full hauler/sweeper with no current task must deliver its load
            // before picking up a new collection task — otherwise it chases
            // sweep/haul targets with a full tank and never deposits.
            // distribute is a DELIVERY task (storage→spawn/ext/tower), not a
            // collection task — a full distributor should take it.
            const carried = creep.store[RESOURCE_ENERGY] || 0;
            const cap = creep.store.getCapacity(RESOURCE_ENERGY) || 0;
            if (cap > 0 && carried > 0 && carried >= cap * 0.5 &&
                (best.task.type === 'haul' || best.task.type === 'sweep')) {
                return null;
            }
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
    if (memory.getSourceId(creep)) {
        sourceRegistry.releaseClaim(creep.name);
        memory.clearSourceId(creep);
    }
}

function applyTaskAssignment(creep, assigned, claimCounts) {
    const prev = memory.getTaskId(creep);
    if (prev !== assigned.id) {
        if (prev && memory.getSourceId(creep) && assigned.type !== 'mine') {
            sourceRegistry.releaseClaim(creep.name);
            memory.clearSourceId(creep);
        }
        logger.event('creep', '[' + Game.time + '] [task] ' + creep.name + ' (' + memory.getRole(creep) + ') -> ' + taskBase.describeTask(assigned));
        memory.setTaskId(creep, assigned.id);
        memory.setLastTaskChange(creep, Game.time);
        logger.setAction(creep, assigned.type);
        if (prev) claimCounts[prev] = Math.max(0, (claimCounts[prev] || 1) - 1);
        claimCounts[assigned.id] = (claimCounts[assigned.id] || 0) + 1;
    }
}

function renewOrRecycle(creep) {
    if (creep.getActiveBodyparts(MOVE) === 0 && !memory.getEmergencyNoMove(creep)) {
        logger.event('creep', '[' + Game.time + '] [no-move] ' + creep.name + ' has no MOVE parts; recycling');
        const spawn = spawnUtil.nearestSpawn(creep);
        if (!spawn) {
            creep.suicide();
            return true;
        }
        if (spawn.recycleCreep(creep) === ERR_NOT_IN_RANGE) {
            move.moveCreep(creep, spawn, { visualizePathStyle: { stroke: '#ff8800' }, reusePath: 10 });
            return true;
        }
        return true;
    }
    // Drive an already-committed obsolete recycle to completion (the creep was
    // flagged on a previous tick and is still walking to the spawn).
    if (memory.getObsoleteRecycling(creep)) {
        if (obsoleteRecycleEnabled() && isObsolete(creep)) {
            const spawn = spawnUtil.nearestSpawn(creep);
            if (spawn) {
                if (spawn.recycleCreep(creep) === ERR_NOT_IN_RANGE) {
                    move.moveCreep(creep, spawn, { visualizePathStyle: { stroke: '#ff8800' }, reusePath: 10 });
                }
                return true;
            }
        } else {
            // Flag disabled or creep no longer obsolete; abandon the recycle.
            memory.clearObsoleteRecycling(creep);
        }
    }
    // Flag a new obsolete recycle (rate-limited one per role at a time).
    if (shouldRecycleObsolete(creep)) {
        const spawn = spawnUtil.nearestSpawn(creep);
        if (spawn) {
            // Free the mining slot / task so the replacement can claim it.
            if (memory.getSourceId(creep)) {
                sourceRegistry.releaseClaim(creep.name);
                memory.clearSourceId(creep);
            }
            memory.clearTaskId(creep);
            memory.setObsoleteRecycling(creep, Game.time);
            recyclingRoles()[memory.getRole(creep)] = true; // keep rate limit consistent this tick
            logger.event('recycle', '[' + Game.time + '] [obsolete-recycle] ' + creep.name);
            if (spawn.recycleCreep(creep) === ERR_NOT_IN_RANGE) {
                move.moveCreep(creep, spawn, { visualizePathStyle: { stroke: '#ff8800' }, reusePath: 10 });
            }
            return true;
        }
    }
    if (shouldRenew(creep)) {
        const renewSpawn = spawnUtil.nearestSpawn(creep);
        if (renewSpawn && renewSpawn.energy > 50) {
            memory.setRenewing(creep, true);
            renew.run(creep);
            return true;
        }
        // No spawn energy available; keep the renewing intent so the creep
        // resumes renewal as soon as the spawn has energy again. Fall through
        // to task selection so the creep can work while waiting.
    }
    return false;
}

function checkStuck(creep) {
    if (!Memory.flags || !Memory.flags.stuckRecycle) return false;
    if (creep.spawning) return false;
    const moveFailures = memory.getMoveFailures(creep);
    if (moveFailures < MOVE_FAIL_THRESHOLD) return false;
    const spawn = spawnUtil.nearestSpawn(creep);
    if (!spawn) return false;
    logger.event('stuck', '[' + Game.time + '] [stuck-recycle] ' + creep.name + ' move-failures=' + moveFailures);
    if (spawn.recycleCreep(creep) === ERR_NOT_IN_RANGE) {
        move.moveCreep(creep, spawn, { visualizePathStyle: { stroke: '#ff8800' }, reusePath: 10 });
    }
    memory.setMoveFailures(creep, 0);
    return true;
}

function blacklistTtlFor(taskType) {
    // Default blacklist window for a failed task. Haul and sweep get a
    // slightly longer window so a container that just emptied (hauler) or
    // a drop that was just picked up (sweeper) isn't immediately re-picked
    // by the same creep on the next evaluation. Combat and harvest stay
    // short so a transient failure (path blocked) recovers quickly.
    if (taskType === 'haul' || taskType === 'remoteHaul') return 10;
    if (taskType === 'sweep') return 10;
    return 5;
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
        // Source-proximate tasks (harvest + mine + remoteMine) repeatedly
        // path to the same source; a transient block shouldn't release the
        // slot. Without this carve-out a stuck miner takes ~50 ticks to
        // walk home instead of retrying next tick.
        if ((taskType === 'harvest' || taskType === 'mine' || taskType === 'remoteMine') && nearTarget) {
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

function combatIdleFallback(creep) {
    // Healer with a squad leader: stick with the leader even when no damaged
    // friendly is visible, so the healer is in position to heal the moment
    // the fighter takes damage. If the leader is dead/gone, clear the stale
    // link and fall through to the default hostile/exit/idle logic.
    const leaderId = creep.memory && creep.memory.squadLeader;
    if (leaderId) {
        const leader = Game.getObjectById(leaderId);
        if (leader) {
            if (!creep.pos.inRangeTo(leader, 3)) {
                logger.setAction(creep, 'follow->leader@' + leader.id);
                move.moveCreep(creep, leader, { visualizePathStyle: { stroke: '#00ff00' }, reusePath: 10 });
            } else {
                logger.setAction(creep, 'guard->leader@' + leader.id);
            }
            return;
        }
        delete creep.memory.squadLeader;
        // Healer without a leader has no attack capability — retreat to
        // the nearest spawn instead of charging at hostiles.
        if (memory.getRole(creep) === 'healer') {
            const retreatSpawn = spawnUtil.nearestSpawn(creep);
            if (retreatSpawn && !creep.pos.isNearTo(retreatSpawn)) {
                logger.setAction(creep, 'retreat->spawn@' + retreatSpawn.id);
                move.moveCreep(creep, retreatSpawn, { visualizePathStyle: { stroke: '#888888' }, reusePath: 10 });
            }
            return;
        }
    }

    // Move toward the nearest visible hostile, or any known hostile position from snapshots.
    const nearest = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (nearest) {
        memory.setLastCombatTick(creep, Game.time);
        logger.setAction(creep, 'patrol->hostile@' + nearest.id);
        move.moveCreep(creep, nearest, { visualizePathStyle: { stroke: '#ff0000' }, reusePath: 10 });
        return;
    }
    // No hostile in this room; try to path toward an adjacent known hostile room.
    const hostileRoom = findClosestHostileRoom(creep.pos.roomName);
    if (hostileRoom) {
        logger.setAction(creep, 'patrol->room@' + hostileRoom);
        const exitDir = Game.map.findExit(creep.pos.roomName, hostileRoom);
        if (exitDir !== ERR_NO_PATH && exitDir !== ERR_INVALID_ARGS) {
            const exitPos = creep.pos.findClosestByRange(exitDir);
            if (exitPos) {
                move.moveCreep(creep, exitPos, { visualizePathStyle: { stroke: '#ff0000' }, reusePath: 20 });
                return;
            }
        }
    }
    // Nothing to fight; demobilize if peacetime drags on — maintaining a
    // standing army in peacetime wastes spawn energy and CPU (best practice:
    // recycle defenders once the threat has clearly passed). Track how long
    // the creep has been threat-free; recycle after DEMOB_THRESHOLD ticks.
    const role = memory.getRole(creep);
    if (role === 'fighter' || role === 'healer') {
        const lastThreat = memory.getLastCombatTick(creep);
        if (!lastThreat) {
            memory.setLastCombatTick(creep, Game.time);
        } else if (Game.time - lastThreat > constants.DEMOB_IDLE_TICKS) {
            const spawn = spawnUtil.nearestSpawn(creep);
            if (spawn) {
                logger.event('demob', '[' + Game.time + '] [demobilize] ' + creep.name + ' (' + role + ') peacetime for ' + (Game.time - lastThreat) + ' ticks');
                if (spawn.recycleCreep(creep) === ERR_NOT_IN_RANGE) {
                    move.moveCreep(creep, spawn, { visualizePathStyle: { stroke: '#888888' }, reusePath: 10 });
                }
                return;
            }
        }
    }
    // Nothing to fight; idle near the nearest spawn.
    const idleSpawn = spawnUtil.nearestSpawn(creep);
    if (idleSpawn && !creep.pos.isNearTo(idleSpawn)) {
        logger.setAction(creep, 'idle->spawn');
        move.moveCreep(creep, idleSpawn, { visualizePathStyle: { stroke: '#888888' }, reusePath: 10 });
    } else {
        logger.setAction(creep, 'idle');
    }
}

function findClosestHostileRoom(fromRoomName) {
    let best = null;
    let bestDist = Infinity;
    for (const name in Game.rooms) {
        const snap = roomManager.get(name);
        if (!snap || !snap.hostiles || snap.hostiles.length === 0) continue;
        const dist = Game.map.getRoomLinearDistance(fromRoomName, name);
        if (typeof dist !== 'number') continue;
        if (dist < bestDist) {
            bestDist = dist;
            best = name;
        }
    }
    return best;
}

function runIdleFallback(creep, room) {
    const role = memory.getRole(creep);
    if (role === 'fighter' || role === 'healer') {
        combatIdleFallback(creep);
        return;
    }
    const capacity = creep.store.getCapacity(RESOURCE_ENERGY) || 0;
    const energy = creep.store[RESOURCE_ENERGY] || 0;
    // A creep with CARRY and energy should deposit it, not force-harvest.
    // Without this, a partial-load hauler with no available task is sent to a
    // source by forceTargetFor and harvests into a partially-full carry —
    // the energy is wasted. Deposit to the nearest structure that needs energy.
    if (capacity > 0 && energy > 0) {
        const snap = roomManager.get(room.name);
        if (snap) {
            // Haulers should only deposit to storage/priority-containers in idle
            // fallback — energy structures are the distributor's job. Without
            // this, haulers dump into spawn/extensions and storage stays empty.
            const opts = {};
            if (role === 'hauler') {
                opts.excludeTypes = { [STRUCTURE_SPAWN]: true, [STRUCTURE_EXTENSION]: true, [STRUCTURE_TOWER]: true };
            }
            const deposit = depositService.findDeposit(creep, snap, opts);
            if (deposit) {
                logger.setAction(creep, 'idle-deposit@' + deposit.id);
                depositService.transferTo(creep, deposit, RESOURCE_ENERGY);
                return;
            }
        }
        // No deposit available; idle near spawn. Don't force-harvest — a
        // full creep harvesting wastes the energy.
        const idleSpawn = spawnUtil.nearestSpawn(creep);
        if (idleSpawn && !creep.pos.isNearTo(idleSpawn)) {
            logger.setAction(creep, 'idle->spawn');
            move.moveCreep(creep, idleSpawn, { visualizePathStyle: { stroke: '#888888' }, reusePath: 10 });
        } else {
            logger.setAction(creep, 'idle');
        }
        return;
    }
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

function collectCombatTasks(role) {
    const out = [];
    const types = role === 'healer' ? ['heal'] : ['defend'];
    for (const roomName in Game.rooms) {
        const snap = roomManager.get(roomName);
        if (!snap) continue;
        for (let t = 0; t < types.length; t++) {
            const type = types[t];
            const tt = tasks.get(type);
            if (!tt) continue;
            const items = tt.tasks(Game.rooms[roomName], snap) || [];
            const priority = tt.priorityFor ? tt.priorityFor(snap) : tt.priority;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (!item || !item.target) continue;
                out.push(taskBase.makeTask(type, priority, item.target, roomName));
            }
        }
    }
    return out;
}

function runCreep(creep, context) {
    if (creep.spawning) return;
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
        // Build an id->task index alongside the task list so findCurrentTask
        // is O(1) instead of a linear scan per creep per tick.
        const idx = {};
        for (let i = 0; i < taskList.length; i++) {
            idx[taskList[i].id] = taskList[i];
        }
        context.taskIndexCache[room.name] = idx;
    }

    // Combat roles (fighter/healer) can take tasks from any visible room,
    // not just the room they are currently standing in.
    const role = memory.getRole(creep);
    // Non-combat creeps must not accept tasks in rooms we don't own. A
    // harvester that dips across a border would otherwise pick up foreign
    // sweep/haul targets with no deposit to empty into, thrashing on the
    // foreign task until the blacklist expires and repeating. Send it home
    // — unless the room is on the `room_allow:<room>` whitelist, in which
    // case the creep may stay and harvest there. A full creep still walks
    // home to deposit (no owned deposit exists in a foreign room); that
    // is handled by forceTargetFor returning null for unowned rooms.
    // Bootstrappers are exempt: they belong to a new room that has no
    // spawn yet, so "send home" would route them back to the spawning room
    // instead of letting them build the new room's spawn.
    const bootstrapRoom = memory.getBootstrapRoom(creep);
    const isBootstrapper = role === 'bootstrapper' || !!bootstrapRoom;

    // Nuke evacuation: if this room is being evacuated due to an incoming
    // nuke, non-combat creeps walk to a safe tile outside the 5x5 blast
    // area. If there's another owned room, route there instead.
    if (role !== 'fighter' && role !== 'healer' && !isBootstrapper &&
        memory.getNukeEvac(room.name)) {
        if (memory.getTaskId(creep)) releaseTask(creep, context.claimCounts);
        // Find the nuke position to avoid
        const nukeEvents = memory.getNukeEvents();
        const ev = nukeEvents[room.name];
        if (ev) {
            // Walk to a corner far from the blast zone
            const nukeX = ev.pos.x;
            const nukeY = ev.pos.y;
            // Pick the room corner farthest from the nuke
            const targetX = nukeX < 25 ? 48 : 2;
            const targetY = nukeY < 25 ? 48 : 2;
            move.moveCreep(creep, { pos: { x: targetX, y: targetY, roomName: room.name }, range: 1 },
                { visualizePathStyle: { stroke: '#ff8800' }, reusePath: 10 });
        }
        logger.setAction(creep, 'nuke-evac');
        return;
    }

    if (role !== 'fighter' && role !== 'healer' && !isBootstrapper &&
        (!room.controller || !room.controller.my) &&
        !roomFlags.getAllowedRooms()[room.name]) {
        if (memory.getTaskId(creep)) releaseTask(creep, context.claimCounts);
        // Send the creep to its owning home room (memory.homeRoom), not just
        // the nearest spawn. With multiple owned rooms, nearestSpawn might
        // route a creep to a foreign-owned spawn that can't accept its deposit.
        const homeRoomName = memory.getHomeRoom(creep);
        const idleSpawn = homeRoomName ? spawnUtil.nearestSpawnInRoom(creep, homeRoomName) : spawnUtil.nearestSpawn(creep);
        if (idleSpawn && !creep.pos.isNearTo(idleSpawn)) {
            logger.setAction(creep, 'return->home');
            move.moveCreep(creep, idleSpawn, { visualizePathStyle: { stroke: '#888888' }, reusePath: 20 });
        } else {
            logger.setAction(creep, 'idle-foreign');
        }
        logger.periodic('status', 25, creep.name, '[' + Game.time + '] [status] ' + logger.statusLine(creep));
        return;
    }
    let combatTasks = null;
    if (role === 'fighter' || role === 'healer') {
        combatTasks = context.combatTaskCache[role];
        if (!combatTasks) {
            combatTasks = collectCombatTasks(role);
            context.combatTaskCache[role] = combatTasks;
        }
        if (combatTasks.length > 0) {
            taskList = combatTasks;
        }
    }

    const snap = roomManager.get(room.name);
    // Pre-filter the task list by role once per (room, role) per tick so
    // bestTaskFor only iterates tasks this role can actually take. Combat
    // creeps already have a type-specific list, so filter inline (cheap).
    let roleTasks;
    if (combatTasks) {
        roleTasks = filterByRole(combatTasks, role);
    } else {
        const key = room.name + ':' + role;
        roleTasks = context.roleTaskCache[key];
        if (!roleTasks) {
            roleTasks = filterByRole(taskList, role);
            context.roleTaskCache[key] = roleTasks;
        }
    }

    const currentTaskId = memory.getTaskId(creep);
    let currentTask = null;
    if (currentTaskId) {
        // When taskList was reassigned to combatTasks above, the room task
        // index doesn't apply (it was built from the non-combat list). Pass
        // null so findCurrentTask falls back to a linear scan of the small
        // combat list.
        const taskIndex = combatTasks && combatTasks.length > 0 ? null : context.taskIndexCache[room.name];
        currentTask = findCurrentTask(taskList, currentTaskId, taskIndex);
        if (!currentTask) {
            releaseTask(creep, context.claimCounts);
        }
    }

    const assigned = selectTask(creep, roleTasks, snap, currentTask, context.claimCounts, context.capCache);
    if (!assigned) {
        releaseTask(creep, context.claimCounts);
        runIdleFallback(creep, room);
        logger.periodic('status', 25, creep.name, '[' + Game.time + '] [status] ' + logger.statusLine(creep));
        return;
    }

    applyTaskAssignment(creep, assigned, context.claimCounts);

    const keep = tasks.run(assigned.type, creep, assigned, snap);
    if (keep === false) {
        // Blacklist this task briefly so a stale target (e.g. an already-empty
        // sweep pile that preempts build every tick then immediately fails)
        // is not re-picked next tick. Per-creep-per-target, so other targets
        // of the same type remain available. TTL is task-type-aware: hauling
        // and sweeping benefit from a slightly longer blacklist so a container
        // that just emptied isn't immediately re-picked.
        memory.addFailedTask(creep, assigned.id, blacklistTtlFor(assigned.type));
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
    collectCombatTasks: collectCombatTasks,
    findCurrentTask: findCurrentTask,
    combatIdleFallback: combatIdleFallback,
    runIdleFallback: runIdleFallback,
};
