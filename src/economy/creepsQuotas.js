const constants = require('../config/constants');

const QUOTAS = {
    0: {},
    1: { harvester: 3, upgrader: 1 },
    2: { harvester: 5, upgrader: 2 },
    3: { miner: 2, hauler: 4, upgrader: 3, builder: 1 },
    4: { miner: 2, hauler: 3, upgrader: 3, builder: 2 },
    5: { miner: 2, hauler: 4, upgrader: 3, builder: 2 },
    6: { miner: 2, hauler: 5, upgrader: 3, builder: 2 },
    7: { miner: 2, hauler: 6, upgrader: 3, builder: 2 },
    8: { miner: 2, hauler: 8, upgrader: 3, builder: 2 },
};

// Order in which roles are evaluated for spawning. `claimer` and
// `bootstrapper` are gated by the `Memory.flags.expansion` flag (see
// expansionRoleQuotas / dynamicQuota) and stay inert until that flag is on.
const ROLE_PRIORITY = ['fighter', 'healer', 'scout', 'reserver', 'claimer', 'bootstrapper', 'miner', 'hauler', 'remoteMiner', 'remoteHauler', 'remoteBuilder', 'harvester', 'builder', 'upgrader'];

const URGENT_TTD = constants.URGENT_TTD;
const CRITICAL_TTD = constants.CRITICAL_TTD;
const WARN_TTD = constants.WARN_TTD;

const STORAGE_FULL_THRESHOLD = constants.STORAGE_FULL_THRESHOLD;
const STORAGE_LOW_THRESHOLD = constants.STORAGE_LOW_THRESHOLD;
const CONSTRUCTION_BACKLOG_THRESHOLD = constants.CONSTRUCTION_BACKLOG_THRESHOLD;

function quotasFor(rcl) {
    return QUOTAS[rcl] || QUOTAS[0];
}

function remoteRoleQuotas() {
    const q = {};
    const rr = Memory.remoteRooms;
    if (!rr || Object.keys(rr).length === 0) return q;
    let activeRooms = 0;
    for (const name in rr) {
        const entry = rr[name];
        if (entry.status === 'abandoned') continue;
        activeRooms++;
        if (entry.status === 'pending' || entry.status === 'scouted') {
            q.scout = (q.scout || 0) + 1;
        }
        if (entry.status === 'scouted' || entry.status === 'reserving' || entry.status === 'reserved' || entry.status === 'active' || entry.status === 'contested') {
            q.reserver = (q.reserver || 0) + 1;
        }
        if ((entry.sourceIds || []).length > 0) {
            q.remoteMiner = (q.remoteMiner || 0) + (entry.sourceIds || []).length;
            q.remoteHauler = (q.remoteHauler || 0) + 2;
        }
        if ((entry.containerSiteIds || []).length > 0 || (entry.roadSiteIds || []).length > 0) {
            q.remoteBuilder = (q.remoteBuilder || 0) + 1;
        }
        if (entry.status === 'contested') {
            q.fighter = (q.fighter || 0) + 2;
            q.healer = (q.healer || 0) + 1;
        }
    }
    // Cap remote rooms overall.
    if (activeRooms > 0) {
        q.remoteHauler = Math.min(q.remoteHauler || 0, activeRooms * 2);
    }
    return q;
}

// Returns true if the home room satisfies all remote-mining prerequisite
// gates from plans/remote-mining.md (RCL>=4, observer present, >=2 home
// sources claimed by live miners, remoteRooms non-empty, flag on). Used by
// dynamicQuota to gate remote-role quotas at the source so the gate is
// enforced regardless of which caller asks for a quota.
function remotePrerequisitesMet() {
    if (!Memory.flags || !Memory.flags.remoteMining) return false;
    const rr = Memory.remoteRooms;
    if (!rr || Object.keys(rr).length === 0) return false;
    // Find any owned room that satisfies the per-room gates. v1 assumes a
    // single home room; if multiple owned rooms qualify, the first one wins.
    for (const name in Game.rooms) {
        const room = Game.rooms[name];
        if (!room.controller || !room.controller.my) continue;
        if (room.controller.level < 4) continue;
        let observer = false;
        const structures = room.find(FIND_STRUCTURES);
        for (let i = 0; i < structures.length; i++) {
            if (structures[i].structureType === STRUCTURE_OBSERVER) { observer = true; break; }
        }
        if (!observer) continue;
        let claimedSources = 0;
        if (Memory.sources) {
            for (const id in Memory.sources) {
                const src = Memory.sources[id];
                if (src.roomName !== room.name) continue;
                let liveClaims = 0;
                for (let j = 0; j < src.slots.length; j++) {
                    if (src.slots[j].claimedBy && Game.creeps[src.slots[j].claimedBy]) liveClaims++;
                }
                if (liveClaims > 0) claimedSources++;
            }
        }
        if (claimedSources < 2) continue;
        return true;
    }
    return false;
}

function expansionRoleQuotas() {
    const q = {};
    const exp = Memory.expansion;
    if (!exp || !exp.target || !exp.target.roomName) return q;
    q.claimer = 1;
    const targetMem = Memory.rooms && Memory.rooms[exp.target.roomName];
    if (targetMem && targetMem.bootstrapping) q.bootstrapper = 2;
    return q;
}

function dynamicQuota(rcl, controller) {
    const q = {};
    const base = quotasFor(rcl);
    const keys = Object.keys(base);
    for (let i = 0; i < keys.length; i++) {
        q[keys[i]] = base[keys[i]];
    }

    if (Memory.flags && Memory.flags.remoteMining && remotePrerequisitesMet()) {
        const remote = remoteRoleQuotas();
        for (const k in remote) q[k] = (q[k] || 0) + remote[k];
    }

    if (Memory.flags && Memory.flags.expansion) {
        const expand = expansionRoleQuotas();
        for (const k in expand) q[k] = (q[k] || 0) + expand[k];
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
            q.upgrader = baseUpgraders + 1;
        }
    }
    return q;
}

function storageRatio(storage) {
    if (!storage) return 0;
    const capacity = storage.store.getCapacity(RESOURCE_ENERGY);
    if (!capacity) return 0;
    return (storage.store[RESOURCE_ENERGY] || 0) / capacity;
}

function constructionBacklog(sites) {
    if (!sites || sites.length === 0) return 0;
    let remaining = 0;
    for (let i = 0; i < sites.length; i++) {
        remaining += sites[i].progressTotal - sites[i].progress;
    }
    return remaining;
}

function contextualQuota(rcl, controller, storage, constructionSites) {
    const q = dynamicQuota(rcl, controller);
    const ratio = storageRatio(storage);
    const backlog = constructionBacklog(constructionSites);
    const baseUpgraders = q.upgrader || 0;
    const baseBuilders = q.builder || 0;

    if (storage && ratio >= STORAGE_FULL_THRESHOLD) {
        q.upgrader = Math.min(6, Math.max(baseUpgraders, baseUpgraders + 2));
    } else if (storage && ratio <= STORAGE_LOW_THRESHOLD) {
        const isUrgent = controller && controller.ticksToDowngrade < URGENT_TTD;
        if (!isUrgent) {
            q.upgrader = Math.max(1, Math.floor(baseUpgraders / 2));
        }
    }

    if (backlog > CONSTRUCTION_BACKLOG_THRESHOLD) {
        q.builder = Math.max(baseBuilders, Math.min(5, baseBuilders + 2));
    }

    return q;
}

function nextRoleToSpawn(creepCounts, rcl, controller, storage, constructionSites) {
    // Income-continuity guard: at RCL 3+, if no miner AND no harvester exist,
    // spawn a harvester first — it can deposit to the spawn directly (via
    // idle-deposit/supply), unlike a miner which needs haulers to move energy
    // from containers. Prevents an income deadlock during the harvester→miner
    // transition if all harvesters die before miners establish.
    if (rcl >= 3 && (creepCounts.miner || 0) === 0 && (creepCounts.harvester || 0) === 0) {
        return 'harvester';
    }
    const q = controller
        ? contextualQuota(rcl, controller, storage, constructionSites)
        : quotasFor(rcl);
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
    contextualQuota: contextualQuota,
    nextRoleToSpawn: nextRoleToSpawn,
    spawnPriority: spawnPriority,
    ROLE_PRIORITY: ROLE_PRIORITY,
    QUOTAS: QUOTAS,
    remotePrerequisitesMet: remotePrerequisitesMet,
};

