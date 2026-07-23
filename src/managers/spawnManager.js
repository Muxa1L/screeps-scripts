const constants = require('../config/constants');
const memory = require('../utils/memorySchema');
const sourceRegistry = require('../economy/sourceRegistry');
const logger = require('../utils/logger');
const bodies = require('../economy/creepsBodies');
const quotas = require('../economy/creepsQuotas');
const roomManager = require('./roomManager');

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
        if (roomName && c.pos.roomName !== roomName) continue;
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
    const mem = { role: role };
    if (extraMem) {
        for (const k in extraMem) mem[k] = extraMem[k];
    }
    const res = spawn.spawnCreep(body, name, { memory: mem });
    if (res !== OK) {
        if (Game.time % 200 === 0) console.log('[' + Game.time + '] [spawn-fail] ' + name + ' (' + role + ') -> ' + res);
        return false;
    }
    logger.event('spawn', '[' + Game.time + '] [spawn] ' + name + ' (' + role + ') cost=' + bodies.bodyCost(body));
    return true;
}

function hostilesInRoom(room) {
    return room.find(FIND_HOSTILE_CREEPS);
}

function tryDefenders(spawn, hostiles) {
    if (hostiles.length === 0) return false;
    const roomName = spawn.room.name;
    const counts = creepCountByRole(roomName);
    const fighters = counts.fighter || 0;
    const healers = counts.healer || 0;
    const cap = spawn.room.energyCapacityAvailable;
    const available = spawn.room.energyAvailable;

    // Maintain a small combat presence while hostiles are visible.
    const desiredFighters = 2;
    const desiredHealers = 1;

    if (fighters < desiredFighters) {
        const pick = bodies.bestBodyForAvailable('fighter', cap, available);
        if (pick) {
            return spawnBody(spawn, pick.body, 'Fighter' + Game.time + '-' + spawn.name, 'fighter');
        }
    }
    if (fighters >= desiredFighters && healers < desiredHealers) {
        const hpick = bodies.bestBodyForAvailable('healer', cap, available);
        if (hpick) {
            return spawnBody(spawn, hpick.body, 'Healer' + Game.time + '-' + spawn.name, 'healer');
        }
    }
    return false;
}

function tryRoleSpawn(spawn, role) {
    const cap = spawn.room.energyCapacityAvailable;
    const available = spawn.room.energyAvailable;
    const prefix = role.charAt(0).toUpperCase() + role.slice(1);
    const name = prefix + Game.time + '-' + spawn.name;
    // Target the best body the room's RCL can support and wait for enough
    // energy to afford it, rather than spawning a weaker body now that
    // underperforms for its whole lifespan.
    const target = bodies.bestBodyForAvailable(role, cap, cap);
    if (target && available >= target.cost) {
        return spawnBody(spawn, target.body, name, role);
    }
    // Not enough energy for the full body. If no harvester/miner is alive,
    // income has stopped and waiting would deadlock — spawn whatever we
    // can afford now to restart income (bootstrap escape).
    if (noIncomeProducer(spawn.room)) {
        const fallback = bodies.bestBodyForAvailable(role, cap, available);
        if (fallback) return spawnBody(spawn, fallback.body, name, role);
    }
    return false;
}

function noIncomeProducer(room) {
    const counts = creepCountByRole(room.name);
    return (counts.harvester || 0) + (counts.miner || 0) === 0;
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
    tryDefenders(spawn, hostiles);
    if (hostiles.length > 0) {
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
};
