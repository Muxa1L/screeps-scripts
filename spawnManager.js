var sourceRegistry = require('sourceRegistry');
var logger = require('logger');
var bodies = require('creepsBodies');
var quotas = require('creepsQuotas');

var BUCKET_SPAWN_THRESHOLD = 2000;
var MIN_BODY_ENERGY = 200;

function creepCountByRole() {
    var counts = {};
    for (var name in Game.creeps) {
        var c = Game.creeps[name];
        var r = c.memory.role;
        if (!r) continue;
        counts[r] = (counts[r] || 0) + 1;
    }
    return counts;
}

function spawnBody(spawn, body, name, role, extraMem) {
    if (spawn.spawning) return false;
    var mem = { role: role };
    if (extraMem) {
        for (var k in extraMem) mem[k] = extraMem[k];
    }
    var res = spawn.spawnCreep(body, name, { memory: mem });
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
    var fighters = _.filter(Game.creeps, function (c) { return c.memory.role === 'fighter'; });
    var healers = _.filter(Game.creeps, function (c) { return c.memory.role === 'healer'; });
    var cap = spawn.room.energyCapacityAvailable;
    var available = spawn.room.energyAvailable;
    if (fighters.length === 0) {
        var pick = bodies.bestBodyForAvailable('fighter', cap, available);
        if (pick) {
            return spawnBody(spawn, pick.body, 'Fighter' + Game.time, 'fighter');
        }
    }
    if (fighters.length > 0 && healers.length === 0) {
        var hpick = bodies.bestBodyForAvailable('healer', cap, available);
        if (hpick) {
            return spawnBody(spawn, hpick.body, 'Healer' + Game.time, 'healer');
        }
    }
    return false;
}

function tryRoleSpawn(spawn, role) {
    var cap = spawn.room.energyCapacityAvailable;
    var available = spawn.room.energyAvailable;
    var pick = bodies.bestBodyForAvailable(role, cap, available);
    if (!pick) return false;
    var prefix = role.charAt(0).toUpperCase() + role.slice(1);
    var name = prefix + Game.time;
    return spawnBody(spawn, pick.body, name, role);
}

function tick() {
    var spawn = Game.spawns['Spawn1'];
    if (!spawn) return;
    if (Game.cpu.bucket < BUCKET_SPAWN_THRESHOLD) return;
    if (spawn.spawning) return;
    var room = spawn.room;
    if (!room.controller || !room.controller.my) return;

    var hostiles = hostilesInRoom(room);
    if (tryDefenders(spawn, hostiles)) return;

    var rcl = room.controller.level;
    var counts = creepCountByRole();

    if (rcl >= 3) {
        sourceRegistry.ensureRegistry(room);
    }

    var controllerState = room.controller ? {
        ticksToDowngrade: room.controller.ticksToDowngrade,
        level: room.controller.level,
    } : null;
    var role = quotas.nextRoleToSpawn(counts, rcl, controllerState);
    if (!role) {
        summaryLog(spawn, counts, rcl);
        return;
    }
    if (tryRoleSpawn(spawn, role)) {
        summaryLog(spawn, counts, rcl);
        return;
    }
    summaryLog(spawn, counts, rcl);
}

function summaryLog(spawn, counts, rcl) {
    var ctl = spawn.room.controller;
    var ttd = (ctl && ctl.ticksToDowngrade !== undefined) ? ctl.ticksToDowngrade : 'n/a';
    var ttdWarn = (typeof ttd === 'number' && ttd < 2000) ? ' *CRITICAL*' : '';
    logger.periodic('spawn', 50, 'tick',
        '[' + Game.time + '] [spawn-state] RCL=' + rcl +
        ' energy=' + spawn.room.energyAvailable + '/' + spawn.room.energyCapacityAvailable +
        ' ttd=' + ttd + ttdWarn +
        ' spawn=' + (spawn.spawning ? spawn.spawning.name : 'idle') +
        ' creeps=' + JSON.stringify(counts)
    );
}

function debug(msg) {
    if (!Memory.flags || !Memory.flags.debugSpawn) return;
    console.log('[' + Game.time + '] [spawn] ' + msg);
}

module.exports = {
    tick: tick,
    bestBodyFor: bodies.bestBodyFor,
    bestBodyForAvailable: bodies.bestBodyForAvailable,
    bodyCost: bodies.bodyCost,
    bodySummary: bodies.bodySummary,
    nextRoleToSpawn: quotas.nextRoleToSpawn,
};
