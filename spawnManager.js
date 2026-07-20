var sourceRegistry = require('sourceRegistry');
var logger = require('logger');
var bodies = require('creepsBodies');
var quotas = require('creepsQuotas');

var BUCKET_SPAWN_THRESHOLD = 2000;

function creepCountByRole(roomName) {
    var counts = {};
    for (var name in Game.creeps) {
        var c = Game.creeps[name];
        if (roomName && c.pos.roomName !== roomName) continue;
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
    var roomName = spawn.room.name;
    var fighters = 0, healers = 0;
    for (var cn in Game.creeps) {
        var c = Game.creeps[cn];
        if (c.pos.roomName !== roomName) continue;
        if (c.memory.role === 'fighter') fighters++;
        else if (c.memory.role === 'healer') healers++;
    }
    var cap = spawn.room.energyCapacityAvailable;
    var available = spawn.room.energyAvailable;
    if (fighters === 0) {
        var pick = bodies.bestBodyForAvailable('fighter', cap, available);
        if (pick) {
            return spawnBody(spawn, pick.body, 'Fighter' + Game.time + '-' + spawn.name, 'fighter');
        }
    }
    if (fighters > 0 && healers === 0) {
        var hpick = bodies.bestBodyForAvailable('healer', cap, available);
        if (hpick) {
            return spawnBody(spawn, hpick.body, 'Healer' + Game.time + '-' + spawn.name, 'healer');
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
    var name = prefix + Game.time + '-' + spawn.name;
    return spawnBody(spawn, pick.body, name, role);
}

function tick() {
    if (Game.cpu.bucket < BUCKET_SPAWN_THRESHOLD) return;
    for (var sn in Game.spawns) {
        var spawn = Game.spawns[sn];
        if (spawn.spawning) continue;
        var room = spawn.room;
        if (!room.controller || !room.controller.my) continue;
        tryRunForSpawn(spawn);
    }
}

function tryRunForSpawn(spawn) {
    var room = spawn.room;
    var hostiles = hostilesInRoom(room);
    if (tryDefenders(spawn, hostiles)) {
        summaryLog(spawn, creepCountByRole(room.name), room.controller.level);
        return;
    }

    var rcl = room.controller.level;

    if (rcl >= 3) {
        sourceRegistry.ensureRegistry(room);
    }

    var counts = creepCountByRole(room.name);
    var controllerState = {
        ticksToDowngrade: room.controller.ticksToDowngrade,
        level: room.controller.level,
    };
    var role = quotas.nextRoleToSpawn(counts, rcl, controllerState);
    summaryLog(spawn, counts, rcl);
    if (!role) return;
    tryRoleSpawn(spawn, role);
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

module.exports = {
    tick: tick,
};
