const memory = require('../utils/memorySchema');
const logger = require('../utils/logger');
const taskRegistry = require('../tasks/taskRegistry');
const creepRunner = require('./creepRunner');

let _claimCounts = {};
let _taskListCache = {};
let _capCache = {};
let _roleTaskCache = {};
let _combatTaskCache = {};
let _taskIndexCache = {};

function refreshClaimCounts() {
    _claimCounts = {};
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        const tid = memory.getTaskId(c);
        if (!tid) continue;
        _claimCounts[tid] = (_claimCounts[tid] || 0) + 1;
    }
}

function buildSummary() {
    const byRole = {};
    const byTask = {};
    let total = 0;
    for (const cn in Game.creeps) {
        total++;
        const cr = Game.creeps[cn];
        // Run the same name-based role inference runCreep does so the
        // summary counts a freshly-spawned creep under its real role
        // rather than 'unknown' (runCreep hasn't run yet this tick).
        let r = memory.getRole(cr);
        if (!r) r = creepRunner.inferRoleFromName(cr.name);
        byRole[r || 'unknown'] = (byRole[r || 'unknown'] || 0) + 1;
        const t = memory.getTaskId(cr);
        if (t) {
            const type = t.split(':')[0];
            byTask[type] = (byTask[type] || 0) + 1;
        } else {
            byTask.idle = (byTask.idle || 0) + 1;
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
    return summary;
}

function logTaskLists() {
    if (Game.time % 50 !== 0) return;
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

function runCreep(creep) {
    // Wrap creep.getActiveBodyparts with a per-tick per-part memoizing shim.
    // A live creep's body never changes within a tick, but getActiveBodyparts
    // is called many times per creep per tick (taskDefend, taskHeal, taskBuild,
    // taskRepair, taskUpgrade, creepRunner, taskRenew, stuckRecycleService).
    // The shim delegates to the original bound method on a cache miss. Reset
    // each tick via creep._bpCacheTick. No-op for creeps without the native
    // method (e.g. test stubs).
    if (typeof creep.getActiveBodyparts === 'function' && creep._bpCacheTick !== Game.time) {
        creep._bpCacheTick = Game.time;
        creep._bpCache = {};
        // Store the NATIVE method once and always wrap that — re-binding the
        // current (already wrapped) function each tick grows an unbounded
        // closure chain over a renewed creep's lifetime.
        if (!creep._bpNative) creep._bpNative = creep.getActiveBodyparts.bind(creep);
        const orig = creep._bpNative;
        creep.getActiveBodyparts = function (part) {
            if (creep._bpCache[part] !== undefined) return creep._bpCache[part];
            const v = orig(part);
            creep._bpCache[part] = v;
            return v;
        };
    }
    const context = {
        claimCounts: _claimCounts,
        taskListCache: _taskListCache,
        capCache: _capCache,
        roleTaskCache: _roleTaskCache,
        combatTaskCache: _combatTaskCache,
        taskIndexCache: _taskIndexCache,
    };
    creepRunner.runCreep(creep, context);
}

module.exports = {
    tick: function () {
        refreshClaimCounts();
        _taskListCache = {};
        _capCache = {};
        _roleTaskCache = {};
        _combatTaskCache = {};
        _taskIndexCache = {};

        logger.periodic('summary', 50, 'tick', buildSummary());

        for (const name in Game.creeps) {
            try {
                runCreep(Game.creeps[name]);
            } catch (e) {
                logger.event('error', '[' + Game.time + '] [creepManager] ' + name + ': ' + e);
                const failed = Game.creeps[name];
                creepRunner.releaseTask(failed, _claimCounts);
            }
        }

        logTaskLists();
    },
    runCreep: runCreep,
};
