const constants = require('../config/constants');
const memory = require('../utils/memorySchema');
const sourceRegistry = require('../economy/sourceRegistry');
const logger = require('../utils/logger');
const bodies = require('../economy/creepsBodies');
const quotas = require('../economy/creepsQuotas');
const roomManager = require('./roomManager');
const linkService = require('./upkeep/linkService');

const BUCKET_SPAWN_THRESHOLD = constants.BUCKET_SPAWN_THRESHOLD;

let _countsCache = {};
let _countsTick = -1;

function creepCountByRole(roomName) {
    if (_countsTick !== Game.time) {
        _countsTick = Game.time;
        _countsCache = {};
    }
    if (_countsCache[roomName]) return _countsCache[roomName];
    const counts = {};
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        // A creep counts against its owning home room's spawn quota, even
        // when commuting to a remote or off fighting. Use memory.homeRoom
        // when set (multi-room); fall back to pos.roomName for legacy creeps
        // that haven't been re-spawned since the homeRoom field was added.
        const homeRoom = c.memory && c.memory.homeRoom;
        const belongsTo = homeRoom || c.pos.roomName;
        if (roomName && belongsTo !== roomName) continue;
        // Being recycled (stuck or obsolete); don't count toward quota so the
        // replacement can spawn while the old creep walks to the spawn.
        if (memory.getRecycling(c) || memory.getObsoleteRecycling(c)) continue;
        const r = memory.getRole(c);
        if (!r) continue;
        // Pre-spawn miner replacements: exclude miners near end-of-life so the
        // replacement spawns ~PRE_SPAWN_TTL before the old miner dies. The
        // replacement walks to the source while the old miner keeps mining,
        // closing the gap to near-zero. c.ticksToLive is undefined while
        // spawning, so the guard avoids excluding a brand-new miner.
        if (r === 'miner' && c.ticksToLive && c.ticksToLive < constants.PRE_SPAWN_TTL) continue;
        counts[r] = (counts[r] || 0) + 1;
    }
    _countsCache[roomName] = counts;
    return counts;
}

function spawnBody(spawn, body, name, role, extraMem) {
    if (spawn.spawning) return false;
    // Tag every creep with homeRoom so multi-room accounting (creepCountByRole
    // by homeRoom, creepRunner send-home) works across N owned rooms. A creep
    // belongs to the room whose spawn queue it was spawned from.
    const mem = { role: role, homeRoom: spawn.room.name };
    if (extraMem) {
        for (const k in extraMem) mem[k] = extraMem[k];
    }
    const res = spawn.spawnCreep(body, name, { memory: mem });
    if (res !== OK) {
        if (Game.time % 200 === 0) console.log('[' + Game.time + '] [spawn-fail] ' + name + ' (' + role + ') -> ' + res);
        return false;
    }
    // No-MOVE bodies are intentional emergency bootstrap creeps; exempt them
    // from the no-MOVE auto-recycle in creepRunner.renewOrRecycle.
    const hasMove = body.indexOf(MOVE) !== -1;
    if (!hasMove) mem._emergencyNoMove = true;
    logger.event('spawn', '[' + Game.time + '] [spawn] ' + name + ' (' + role + ') cost=' + bodies.bodyCost(body));
    return true;
}

// Remote-mining prerequisite gate lives in quotas.remotePrerequisitesMet
// so it applies to every quota lookup. spawnManager consults it indirectly
// via quotas.dynamicQuota / quotas.nextRoleToSpawn.

function hostilesInRoom(room) {
    const snap = roomManager.get(room.name);
    if (snap && snap.hostiles) return snap.hostiles;
    return room.find(FIND_HOSTILE_CREEPS);
}

// Find the most recently spawned fighter that no healer is currently paired
// with (no live healer has memory.squadLeader == fighter.id). Used to assign
// a new healer a squad leader at spawn time. Returns the fighter creep or
// null. No reverse link is stored on the fighter, so pairing is deduped by
// scanning healer memory.squadLeader values each time a healer is about to
// spawn — cheap because it runs only at spawn time, not per tick.
function activeRaidCount() {
    const intel = Memory.intel;
    if (!intel || !intel.raids) return 0;
    let count = 0;
    for (const rn in intel.raids) {
        if (intel.raids[rn]) count++;
    }
    return count;
}

function findUnpairedFighter() {
    const pairedLeaderIds = {};
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (memory.getRole(c) !== 'healer') continue;
        const leaderId = c.memory && c.memory.squadLeader;
        if (leaderId) pairedLeaderIds[leaderId] = true;
    }
    let candidate = null;
    let newestTickssToLive = -1;
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (memory.getRole(c) !== 'fighter') continue;
        if (pairedLeaderIds[c.id]) continue;
        // Prefer the most recently spawned fighter (highest ticksToLive).
        if (typeof c.ticksToLive === 'number' && c.ticksToLive > newestTickssToLive) {
            newestTickssToLive = c.ticksToLive;
            candidate = c;
        }
    }
    return candidate;
}

function tryDefenders(spawn, hostiles) {
    if (hostiles.length === 0) return false;
    const roomName = spawn.room.name;
    const counts = creepCountByRole(roomName);
    const fighters = counts.fighter || 0;
    const healers = counts.healer || 0;
    const cap = spawn.room.energyCapacityAvailable;
    const available = spawn.room.energyAvailable;

    // Squad-aware desired counts when the squads flag is on.
    let desiredSquads;
    if (Memory.flags && Memory.flags.squads) {
        desiredSquads = activeRaidCount() > 0 ? constants.DESIRED_SQUADS_RAID : constants.DESIRED_SQUADS_BASE;
    } else {
        // Legacy: fixed counts (2 fighters + 1 healer) regardless of squads.
        desiredSquads = 1;
    }
    const desiredFighters = Memory.flags && Memory.flags.squads ? desiredSquads : 2;
    const desiredHealers = Memory.flags && Memory.flags.squads ? desiredSquads : 1;

    if (fighters < desiredFighters) {
        const pick = bodies.bestBodyForAvailable('fighter', cap, available);
        if (pick) {
            const extraMem = (Memory.flags && Memory.flags.squads)
                ? { squadId: 'squad-' + Game.time + '-' + spawn.name, squadRole: 'leader' }
                : {};
            return spawnBody(spawn, pick.body, 'Fighter' + Game.time + '-' + spawn.name, 'fighter', extraMem);
        }
    }
    if (fighters >= desiredFighters && healers < desiredHealers) {
        const hpick = bodies.bestBodyForAvailable('healer', cap, available);
        if (hpick) {
            // Pair this healer with the newest unpaired fighter so the healer
            // follows and preferentially heals its squad leader. If no
            // unpaired fighter exists (e.g. healer spawned first), the healer
            // operates independently and reverts to nearest-damaged-friendly.
            const fighter = findUnpairedFighter();
            const extraMem = { squadLeader: fighter ? fighter.id : null };
            if (Memory.flags && Memory.flags.squads) {
                extraMem.squadRole = 'medic';
                if (fighter && memory.getSquadId(fighter)) {
                    extraMem.squadId = memory.getSquadId(fighter);
                } else {
                    const derivedId = 'squad-' + Game.time + '-' + spawn.name;
                    extraMem.squadId = derivedId;
                    if (fighter) {
                        memory.setSquadId(fighter, derivedId);
                        memory.setSquadRole(fighter, 'leader');
                    }
                }
            }
            return spawnBody(spawn, hpick.body, 'Healer' + Game.time + '-' + spawn.name, 'healer', extraMem);
        }
    }
    return false;
}

function tryRoleSpawn(spawn, role, allowCheapFallback) {
    const cap = spawn.room.energyCapacityAvailable;
    const available = spawn.room.energyAvailable;
    const prefix = role.charAt(0).toUpperCase() + role.slice(1);
    const name = prefix + Game.time + '-' + spawn.name;
    // Target the best body the room's RCL can support and wait for enough
    // energy to afford it, rather than spawning a weaker body now that
    // underperforms for its whole lifespan.
    const target = bodies.bestBodyForAvailable(role, cap, cap);
    if (target && available >= target.cost) {
        return spawnBody(spawn, target.body, name, role, extraMemFor(role, spawn));
    }
    // Not enough energy for the full body. If no harvester/miner is alive,
    // income has stopped and waiting would deadlock — spawn whatever we
    // can afford now to restart income (bootstrap escape).
    if (noIncomeProducer(spawn.room)) {
        const fallback = bodies.bestBodyForAvailable(role, cap, available);
        if (fallback) return spawnBody(spawn, fallback.body, name, role, extraMemFor(role, spawn));
    }
    // Critical-role shortage escape: if the spawn can't afford the full body
    // AND storage+links are empty (no bootstrap source), the room is in a
    // death spiral. Carriers (distributor/hauler/upgrader) with very low TTL
    // won't survive long enough for the spawn to accumulate enough energy.
    // Spawn the best body we can afford NOW so the role isn't vacant when
    // the current creep dies. This is gated on storage+links being empty so
    // it only triggers in genuine starvation, not during normal filling.
    if (target && available < target.cost) {
        const snap = roomManager.get(spawn.room.name);
        const storageEnergy = snap && snap.storage ? (snap.storage.store[RESOURCE_ENERGY] || 0) : 0;
        const linkEnergy = snap && snap.links ? snap.links.reduce(function (sum, l) { return sum + (l.store[RESOURCE_ENERGY] || 0); }, 0) : 0;
        if (storageEnergy < 200 && linkEnergy < 200) {
            // Room is starving — spawn what we can afford for any missing role.
            const fallback = bodies.bestBodyForAvailable(role, cap, available);
            if (fallback && fallback.cost < (target ? target.cost : Infinity)) {
                return spawnBody(spawn, fallback.body, name, role, extraMemFor(role, spawn));
            }
        } else if (available >= target.cost * 0.75) {
            // Near-miss: room has energy in storage/links but spawn can't
            // quite afford the full body (shortfall < 25%). Spawn the best
            // affordable body to avoid a deadlock where the spawn waits for
            // extensions to fill but the distributor that should fill them
            // is stuck or idle. The slightly weaker body is far better than
            // no creep at all for potentially thousands of ticks.
            const fallback = bodies.bestBodyForAvailable(role, cap, available);
            if (fallback && fallback.cost < target.cost) {
                return spawnBody(spawn, fallback.body, name, role, extraMemFor(role, spawn));
            }
        }
    }
    // Only allow cheap body fallback from the emergency bootstrap path
    // (storage has energy but spawn can't afford the full body). Without
    // this gate, the spawn would always spawn underpowered creeps instead
    // of waiting for enough energy for the full body.
    if (allowCheapFallback) {
        const cheap = bodies.bestBodyForAvailable(role, cap, available);
        if (cheap && cheap.cost < (target ? target.cost : Infinity)) {
            return spawnBody(spawn, cheap.body, name, role, extraMemFor(role, spawn));
        }
    }
    return false;
}

// Expansion roles carry extra memory so the bootstrap/claim pipeline can
// route them and the send-home guard can exempt them.
function extraMemFor(role, spawn) {
    if (role === 'bootstrapper') {
        const exp = memory.getExpansion();
        const targetRoom = exp && exp.target ? exp.target.roomName : null;
        return targetRoom ? { bootstrapRoom: targetRoom } : {};
    }
    if (role === 'claimer') {
        return {};
    }
    return undefined;
}

function noIncomeProducer(room) {
    const counts = creepCountByRole(room.name);
    const producers = (counts.harvester || 0) + (counts.miner || 0);
    // No producers at all → income is dead, must bootstrap.
    // Or: only one harvester with no miners → income exists but is
    // too weak to fill the spawn. Without a fallback, the spawn waits for
    // enough energy for a full-body creep and deadlocks.
    // Also check storage link energy — if links have energy, a distributor
    // can bootstrap from them even with an empty storage.
    if (producers === 0) return true;
    const snap = roomManager.get(room.name);
    const _sources = snap && snap.sources ? snap.sources : [];
    const storageLinkEnergy = snap && snap.links ? snap.links.reduce(function (sum, l) { return linkService.isSourceLink(l, _sources) ? sum : sum + (l.store[RESOURCE_ENERGY] || 0); }, 0) : 0;
    const storageEnergy = snap && snap.storage ? (snap.storage.store[RESOURCE_ENERGY] || 0) : 0;
    const available = storageEnergy + storageLinkEnergy;
    if (counts.miner === 0 && counts.harvester <= 1 && (room.energyAvailable < 200 || available < 200)) return true;
    return false;
}

function tick() {
    if (Game.cpu.bucket !== undefined && Game.cpu.bucket < BUCKET_SPAWN_THRESHOLD && Game.shard.name !== 'sim') return;
    for (const sn in Game.spawns) {
        const spawn = Game.spawns[sn];
        if (spawn.spawning) continue;
        const room = spawn.room;
        if (!room.controller || !room.controller.my) continue;
        tryRunForSpawn(spawn);
    }
}

function tryRunForSpawn(spawn) {
    const room = spawn.room;
    const hostiles = hostilesInRoom(room);
    // Safe mode neutralizes hostiles in the room (they can't act) while our
    // own creeps can still hit them, so spawning defenders is wasted energy.
    // Skip defender spawning AND the early-return that prioritizes defenders
    // over the economy so normal role spawning continues during safe mode.
    const safeModeActive = !!(room.controller && room.controller.safeMode);
    if (hostiles.length > 0 && !safeModeActive) {
        tryDefenders(spawn, hostiles);
        summaryLog(spawn, creepCountByRole(room.name), room.controller.level);
        return;
    }

    const rcl = room.controller.level;

    if (rcl >= 3) {
        sourceRegistry.ensureRegistry(room);
    }

    const counts = creepCountByRole(room.name);
    const controllerState = {
        ticksToDowngrade: room.controller.ticksToDowngrade,
        level: room.controller.level,
    };
    const snap = roomManager.get(room.name);
    const role = quotas.nextRoleToSpawn(counts, rcl, controllerState, snap && snap.storage, snap && snap.constructionSites);

    // Emergency bootstrap: if storage or storage link has energy but spawn
    // can't afford the role returned by nextRoleToSpawn (e.g. miner=400),
    // try a cheaper role that can withdraw from storage/link and fill the
    // spawn (distributor=100). Without this, the spawn deadlocks waiting
    // for a miner it can't afford while energy sits in links.
    const _srcs = snap && snap.sources ? snap.sources : [];
    const storageLinkEnergy = snap && snap.links ? snap.links.reduce(function (sum, l) { return linkService.isSourceLink(l, _srcs) ? sum : sum + (l.store[RESOURCE_ENERGY] || 0); }, 0) : 0;
    const storageEnergy = snap && snap.storage ? (snap.storage.store[RESOURCE_ENERGY] || 0) : 0;
    const totalAvailable = storageEnergy + storageLinkEnergy;
    if (role && totalAvailable > 200) {
        const target = bodies.bestBodyForAvailable(role, room.energyCapacityAvailable, room.energyCapacityAvailable);
        if (target && room.energyAvailable < target.cost) {
            // Can't afford the preferred role — try cheaper alternatives
            // that can bootstrap from storage.
            const cheapOrder = ['distributor', 'hauler', 'harvester'];
            for (let i = 0; i < cheapOrder.length; i++) {
                const alt = cheapOrder[i];
                const altTarget = bodies.bestBodyForAvailable(alt, room.energyCapacityAvailable, room.energyAvailable);
                if (altTarget && (counts[alt] || 0) < (quotas.quotasFor(rcl)[alt] || 0)) {
                    summaryLog(spawn, counts, rcl);
                    tryRoleSpawn(spawn, alt, true);
                    return;
                }
            }
        }
    }

    // Remote / expansion roles are gated inside quotas.dynamicQuota via
    // quotas.remotePrerequisitesMet, so no separate secondary pass is needed.

    summaryLog(spawn, counts, rcl);
    if (!role) return;
    tryRoleSpawn(spawn, role);
}

function summaryLog(spawn, counts, rcl) {
    const ctl = spawn.room.controller;
    const ttd = (ctl && ctl.ticksToDowngrade !== undefined) ? ctl.ticksToDowngrade : 'n/a';
    const ttdWarn = (typeof ttd === 'number' && ttd < 2000) ? ' *CRITICAL*' : '';
    logger.periodic('spawn', 50, 'tick',
        '[' + Game.time + '] [spawn-state] RCL=' + rcl +
        ' energy=' + spawn.room.energyAvailable + '/' + spawn.room.energyCapacityAvailable +
        ' ttd=' + ttd + ttdWarn +
        ' spawn=' + (spawn.spawning ? spawn.spawning.name : 'idle') +
        ' creeps=' + JSON.stringify(counts)
    );
}

module.exports = {
    tick: tick,
    hostilesInRoom: hostilesInRoom,
    findUnpairedFighter: findUnpairedFighter,
};
