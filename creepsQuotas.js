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

function quotasFor(rcl) {
    return QUOTAS[rcl] || QUOTAS[0];
}

function nextRoleToSpawn(creepCounts, rcl) {
    var q = quotasFor(rcl);
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
    nextRoleToSpawn: nextRoleToSpawn,
    spawnPriority: spawnPriority,
    ROLE_PRIORITY: ROLE_PRIORITY,
    QUOTAS: QUOTAS,
};
