const constants = require('../config/constants');

const QUOTAS = {
    0: {},
    1: { harvester: 3, upgrader: 1 },
    2: { harvester: 5, upgrader: 2 },
    3: { miner: 2, hauler: 3, distributor: 2, upgrader: 3, builder: 1 },
    4: { miner: 2, hauler: 2, distributor: 3, upgrader: 3, builder: 2 },
    5: { miner: 2, hauler: 2, distributor: 2, upgrader: 3, builder: 2 },
    6: { miner: 2, hauler: 4, distributor: 3, upgrader: 3, builder: 2 },
    7: { miner: 2, hauler: 5, distributor: 3, upgrader: 3, builder: 2 },
    8: { miner: 2, hauler: 6, distributor: 4, upgrader: 3, builder: 2 },
};

// Order in which roles are evaluated for spawning. `claimer` and
// `bootstrapper` are gated by the `Memory.flags.expansion` flag (see
// expansionRoleQuotas / dynamicQuota) and stay inert until that flag is on.
const ROLE_PRIORITY = ['fighter', 'healer', 'scout', 'reserver', 'claimer', 'bootstrapper', 'miner', 'hauler', 'distributor', 'remoteMiner', 'remoteHauler', 'remoteBuilder', 'harvester', 'builder', 'upgrader'];

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

// Total CARRY parts needed to move energy from all actively-mined sources to
// their deposit points (containers/links/storage). Per source: 10 e/t output
// (5-WORK miner saturating the source) × round trip (2 × distance) / 50 e per
// CARRY. Sources with no live miner claim contribute nothing.
function haulerDemand(roomName) {
    let totalCarry = 0;
    const sources = Memory.sources || {};
    for (const id in sources) {
        const src = sources[id];
        if (src.roomName !== roomName) continue;
        // Only count sources actually being mined right now.
        let mined = false;
        if (src.slots) {
            for (let i = 0; i < src.slots.length; i++) {
                if (src.slots[i].claimedBy && Game.creeps[src.slots[i].claimedBy]) { mined = true; break; }
            }
        }
        if (!mined) continue;
        // Sources with a link-adjacent claimed slot don't need haulers — the
        // miner transfers straight into the link and the link pipeline does
        // the hauling. Counting them over-provisions carriers that idle.
        if (sourceHasLinkDeposit(src, roomName)) continue;
        const dist = haulerPathDistance(roomName, id);
        if (!dist) continue;
        totalCarry += Math.ceil((10 * 2 * dist) / 50);
    }
    return totalCarry;
}

// True when the source has a link within transfer range of its claimed
// miner's slot (link exists near source AND the claim is live).
function sourceHasLinkDeposit(src, roomName) {
    const room = Game.rooms[roomName];
    if (!room) return false;
    const links = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_LINK } });
    if (links.length === 0) return false;
    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const dx = Math.abs(link.pos.x - src.x);
        const dy = Math.abs(link.pos.y - src.y);
        if (dx <= 2 && dy <= 2) return true;
    }
    return false;
}

// Cached path distance from a source to its dropoff (nearest of container
// adjacent tile / link / storage). Falls back to linear distance on failure.
const _distCache = {};
function haulerPathDistance(roomName, sourceId) {
    const key = roomName + ':' + sourceId;
    if (_distCache[key] && Game.time - _distCache[key].tick < 3000) return _distCache[key].dist;
    const room = Game.rooms[roomName];
    if (!room) return null;
    const src = room.find(FIND_SOURCES, { filter: function (s) { return s.id === sourceId; } })[0];
    if (!src) return null;
    let best = null;
    // Nearest deposit target: containers, links, or storage.
    const targets = room.find(FIND_STRUCTURES, {
        filter: function (s) {
            return s.structureType === STRUCTURE_CONTAINER ||
                   s.structureType === STRUCTURE_LINK ||
                   s.structureType === STRUCTURE_STORAGE;
        },
    });
    for (let i = 0; i < targets.length; i++) {
        const d = src.pos.getRangeTo(targets[i]);
        if (best === null || d < best) best = d;
    }
    if (best === null) best = 10; // sensible default when no structures yet
    _distCache[key] = { dist: best, tick: Game.time };
    return best;
}

// CARRY parts in the biggest hauler body the room can currently afford to
// spawn (based on energyCapacityAvailable).
function haulerCarryCapacity(rcl) {
    const bodies = require('./creepsBodies');
    const haulerTable = bodies.BODIES && bodies.BODIES.hauler;
    if (!haulerTable) return 12; // fallback: 600-cost body
    const keys = Object.keys(haulerTable).map(Number).sort(function (a, b) { return a - b; });
    // Biggest body within the room's spawn capacity for this RCL.
    const caps = { 1: 300, 2: 400, 3: 800, 4: 1300, 5: 1800, 6: 2300, 7: 5300, 8: 12300 };
    const cap = caps[rcl] || 1800;
    let bestCarry = 4; // smallest sensible fallback
    for (let i = 0; i < keys.length; i++) {
        const body = haulerTable[keys[i]];
        let cost = 0;
        let carry = 0;
        for (let j = 0; j < body.length; j++) {
            cost += body[j] === CARRY ? 50 : body[j] === MOVE ? 50 : 100;
            if (body[j] === CARRY) carry++;
        }
        if (cost <= cap && carry > bestCarry) bestCarry = carry;
    }
    return bestCarry;
}

function constructionBacklog(sites) {
    if (!sites || sites.length === 0) return 0;
    let remaining = 0;
    for (let i = 0; i < sites.length; i++) {
        remaining += sites[i].progressTotal - sites[i].progress;
    }
    return remaining;
}

function contextualQuota(rcl, controller, storage, constructionSites, roomName) {
    const q = dynamicQuota(rcl, controller);
    const ratio = storageRatio(storage);
    const backlog = constructionBacklog(constructionSites);
    const baseUpgraders = q.upgrader || 0;
    const baseBuilders = q.builder || 0;

    // Hauler sizing by throughput math instead of a fixed quota: each source
    // with an active miner produces up to 10 e/t; a hauler round trip is
    // ~2 × pathDistance ticks carrying 50 e per CARRY part, so the room needs
    // totalCarry = output × 2 × avgDistance / 50 CARRY parts. Convert that to
    // whole haulers using the biggest affordable hauler body and clamp to
    // [base-1 .. base+1] so the formula nudges the baseline rather than
    // replacing it (protects against pathing spikes and dead ticks).
    if (roomName) {
        const neededCarry = haulerDemand(roomName);
        if (neededCarry > 0) {
            const carryPerHauler = haulerCarryCapacity(rcl);
            if (carryPerHauler > 0) {
                const baseHaulers = q.hauler || 1;
                q.hauler = Math.max(
                    Math.max(1, baseHaulers - 1),
                    Math.min(baseHaulers + 1, Math.ceil(neededCarry / carryPerHauler))
                );
            }
        }
    }

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

function nextRoleToSpawn(creepCounts, rcl, controller, storage, constructionSites, roomName) {
    // Income-continuity guard: at RCL 3+, if no miner AND no harvester exist,
    // spawn a harvester first — it can deposit to the spawn directly (via
    // idle-deposit/supply), unlike a miner which needs haulers to move energy
    // from containers. Prevents an income deadlock during the harvester→miner
    // transition if all harvesters die before miners establish.
    if (rcl >= 3 && (creepCounts.miner || 0) === 0 && (creepCounts.harvester || 0) === 0) {
        return 'harvester';
    }
    const q = controller
        ? contextualQuota(rcl, controller, storage, constructionSites, roomName)
        : quotasFor(rcl);
    // Recovery gating: haulers/distributors are only worth energy when there
    // is actually something to move. During a rebuild (no miners → empty
    // containers; empty storage/links) their quotas drop to zero so the spawn
    // spends energy on producers instead of carriers that would stand idle.
    if ((creepCounts.miner || 0) === 0) {
        q.hauler = 0;
    }
    const stE = storage ? (storage.store[RESOURCE_ENERGY] || 0) : 0;
    if (stE < 100) {
        q.distributor = 0;
        q.hauler = Math.min(q.hauler || 0, 1);
    }
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

