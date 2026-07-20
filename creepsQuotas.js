var QUOTAS = {
    0: {},
    1: { harvester: 3, upgrader: 1 },
    2: { harvester: 5, upgrader: 2 },
    3: { miner: 4, hauler: 2, upgrader: 2 },
    4: { miner: 6, hauler: 3, upgrader: 3 },
    5: { miner: 6, hauler: 4, upgrader: 3 },
    6: { miner: 8, hauler: 5, upgrader: 3 },
    7: { miner: 10, hauler: 6, upgrader: 3 },
    8: { miner: 12, hauler: 8, upgrader: 3 },
};

var ROLE_PRIORITY = ['fighter', 'healer', 'hauler', 'miner', 'harvester', 'upgrader', 'builder'];

var URGENT_TTD = 500;
var CRITICAL_TTD = 2000;
var WARN_TTD = 5000;

function quotasFor(rcl) {
    return QUOTAS[rcl] || QUOTAS[0];
}

function dynamicQuota(rcl, controller) {
    var q = {};
    var base = quotasFor(rcl);
    for (var k in base) {
        if (base.hasOwnProperty(k)) q[k] = base[k];
    }
    if (controller && controller.ticksToDowngrade !== undefined && controller.ticksToDowngrade !== null) {
        var ttd = controller.ticksToDowngrade;
        var baseUpgraders = q.upgrader || 0;
        if (ttd < URGENT_TTD) {
            q.upgrader = Math.max(baseUpgraders, 4);
            q.hauler = Math.max(q.hauler || 0, 1);
        } else if (ttd < CRITICAL_TTD) {
            q.upgrader = Math.max(baseUpgraders, 3);
        } else if (ttd < WARN_TTD) {
            q.upgrader = Math.max(baseUpgraders, baseUpgraders + 1);
        }
    }
    return q;
}

function nextRoleToSpawn(creepCounts, rcl, controller) {
    var q = controller ? dynamicQuota(rcl, controller) : quotasFor(rcl);
    for (var i = 0; i < ROLE_PRIORITY.length; i++) {
        var role = ROLE_PRIORITY[i];
        var target = q[role];
        if (!target) continue;
        var have = creepCounts[role] || 0;
        if (have < target) return role;
    }
    return null;
}

function spawnPriority(role) {
    var idx = ROLE_PRIORITY.indexOf(role);
    return idx === -1 ? 999 : idx;
}

module.exports = {
    quotasFor: quotasFor,
    dynamicQuota: dynamicQuota,
    nextRoleToSpawn: nextRoleToSpawn,
    spawnPriority: spawnPriority,
    ROLE_PRIORITY: ROLE_PRIORITY,
    QUOTAS: QUOTAS,
};

