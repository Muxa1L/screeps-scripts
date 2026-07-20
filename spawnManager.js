const sourceRegistry = require('sourceRegistry');
const logger = require('logger');
const bodies = require('creepsBodies');
const quotas = require('creepsQuotas');

const BUCKET_SPAWN_THRESHOLD = 2000;

function creepCountByRole(roomName) {
    const counts = {};
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (roomName && c.pos.roomName !== roomName) continue;
        const r = c.memory.role;
        if (!r) continue;
        counts[r] = (counts[r] || 0) + 1;
    }
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
    let fighters = 0, healers = 0;
    for (const cn in Game.creeps) {
        const c = Game.creeps[cn];
        if (c.pos.roomName !== roomName) continue;
        if (c.memory.role === 'fighter') fighters++;
        else if (c.memory.role === 'healer') healers++;
    }
    const cap = spawn.room.energyCapacityAvailable;
    const available = spawn.room.energyAvailable;
    if (fighters === 0) {
        const pick = bodies.bestBodyForAvailable('fighter', cap, available);
        if (pick) {
            return spawnBody(spawn, pick.body, 'Fighter' + Game.time + '-' + spawn.name, 'fighter');
        }
    }
    if (fighters > 0 && healers === 0) {
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
    const pick = bodies.bestBodyForAvailable(role, cap, available);
    if (!pick) return false;
    const prefix = role.charAt(0).toUpperCase() + role.slice(1);
    const name = prefix + Game.time + '-' + spawn.name;
    return spawnBody(spawn, pick.body, name, role);
}

function tick() {
    if (Game.cpu.bucket < BUCKET_SPAWN_THRESHOLD) return;
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
    if (tryDefenders(spawn, hostiles)) {
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
    const role = quotas.nextRoleToSpawn(counts, rcl, controllerState);
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
