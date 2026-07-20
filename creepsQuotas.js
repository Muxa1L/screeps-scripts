const QUOTAS = {
    0: {},
    1: { harvester: 3, upgrader: 1 },
    2: { harvester: 5, upgrader: 2 },
    3: { miner: 4, hauler: 2, upgrader: 2, builder: 1 },
    4: { miner: 6, hauler: 3, upgrader: 3, builder: 2 },
    5: { miner: 6, hauler: 4, upgrader: 3, builder: 2 },
    6: { miner: 8, hauler: 5, upgrader: 3, builder: 2 },
    7: { miner: 8, hauler: 6, upgrader: 3, builder: 2 },
    8: { miner: 8, hauler: 8, upgrader: 3, builder: 2 },
};

const ROLE_PRIORITY = ['fighter', 'healer', 'hauler', 'miner', 'harvester', 'builder', 'upgrader'];

const URGENT_TTD = 500;
const CRITICAL_TTD = 2000;
const WARN_TTD = 5000;

function quotasFor(rcl) {
    return QUOTAS[rcl] || QUOTAS[0];
}

function dynamicQuota(rcl, controller) {
    const q = {};
    const base = quotasFor(rcl);
    const keys = Object.keys(base);
    for (let i = 0; i < keys.length; i++) {
        q[keys[i]] = base[keys[i]];
    }
    if (controller && controller.ticksToDowngrade !== undefined && controller.ticksToDowngrade !== null) {
        const ttd = controller.ticksToDowngrade;
        const baseUpgraders = q.upgrader || 0;
        let totalQuota = 0;
        for (const k in q) totalQuota += q[k];
        const maxUpgraders = Math.max(1, Math.floor(totalQuota / 2));
        if (ttd < URGENT_TTD) {
            q.upgrader = Math.max(baseUpgraders, Math.min(4, maxUpgraders));
            q.hauler = Math.max(q.hauler || 0, 1);
        } else if (ttd < CRITICAL_TTD) {
            q.upgrader = Math.max(baseUpgraders, Math.min(3, maxUpgraders));
        } else if (ttd < WARN_TTD) {
            q.upgrader = Math.max(baseUpgraders, baseUpgraders + 1);
        }
    }
    return q;
}

function nextRoleToSpawn(creepCounts, rcl, controller) {
    const q = controller ? dynamicQuota(rcl, controller) : quotasFor(rcl);
    for (let i = 0; i < ROLE_PRIORITY.length; i++) {
        const role = ROLE_PRIORITY[i];
        const target = q[role];
        if (!target) continue;
        const have = creepCounts[role] || 0;
        if (have < target) return role;
    }
    return null;
}

function spawnPriority(role) {
    const idx = ROLE_PRIORITY.indexOf(role);
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

