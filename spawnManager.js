var sourceRegistry = require('sourceRegistry');

var RENEW_COST = 50;
var BUCKET_SPAWN_THRESHOLD = 2000;
var HARVESTER_TARGET = 5;
var UPGRADER_TARGET = 3;
var HAULER_TARGET = 2;
var MIN_BODY_ENERGY = 200;

var WORKER_BODY = [WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE];
var WORKER_BODY_ENERGY = 800;
var EARLY_WORKER_BODY = [WORK, CARRY, CARRY, MOVE, MOVE];
var EARLY_WORKER_BODY_ENERGY = 300;
var FIGHTER_BODY = [TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK];
var HEALER_BODY = [TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL];

var MINER_BODIES = {
    200:  [WORK, MOVE],
    300:  [WORK, WORK, MOVE],
    550:  [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE],
    800:  [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, MOVE, MOVE],
    1300: [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE],
    1800: [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE],
    2300: [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE],
    5600: [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE],
};
var HAULER_BODIES = {
    200:  [CARRY, MOVE],
    300:  [CARRY, CARRY, MOVE, MOVE],
    550:  [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE],
    800:  [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE],
    1300: [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
    1800: [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
};

function bestBodyFor(templates, capacity) {
    var keys = Object.keys(templates).map(Number).sort(function (a, b) { return a - b; });
    var chosen = keys[0];
    for (var i = 0; i < keys.length; i++) {
        if (keys[i] <= capacity) chosen = keys[i];
        else break;
    }
    return { body: templates[chosen], cost: chosen };
}

function spawnBody(spawn, body, name, role, extraMem) {
    if (spawn.spawning) return false;
    var mem = { role: role };
    if (extraMem) {
        for (var k in extraMem) mem[k] = extraMem[k];
    }
    var res = spawn.spawnCreep(body, name, { memory: mem });
    if (res !== OK) {
        if (Game.time % 200 === 0) console.log('spawn failed for ' + name + ': ' + res);
        return false;
    }
    return true;
}

function tick() {
    var spawn = Game.spawns['Spawn1'];
    if (!spawn) { debug('no spawn'); return; }
    if (Game.cpu.bucket < BUCKET_SPAWN_THRESHOLD) { debug('bucket low: ' + Game.cpu.bucket); return; }
    if (spawn.spawning) { debug('already spawning ' + spawn.spawning.name); return; }
    var room = spawn.room;
    if (!room.controller || !room.controller.my) { debug('no controller'); return; }

    var hostiles = room.find(FIND_HOSTILE_CREEPS);
    if (hostiles.length > 0) {
        var fighters = _.filter(Game.creeps, function (c) { return c.memory.role === 'fighter'; });
        var healers = _.filter(Game.creeps, function (c) { return c.memory.role === 'healer'; });
        if (fighters.length === 0 && room.energyCapacityAvailable >= 720) {
            spawnBody(spawn, FIGHTER_BODY, 'Fighter' + Game.time, 'fighter');
            return;
        }
        if (fighters.length > 0 && healers.length === 0 && room.energyCapacityAvailable >= 720) {
            spawnBody(spawn, HEALER_BODY, 'Healer' + Game.time, 'healer');
            return;
        }
    }

    var capacity = room.energyCapacityAvailable;
    var available = room.energyAvailable;
    if (available < MIN_BODY_ENERGY) { debug('low energy: ' + available + '/' + capacity); return; }

    if (room.controller.level >= 3) {
        sourceRegistry.ensureRegistry(room);

        var miners = _.filter(Game.creeps, function (c) { return c.memory.role === 'miner'; });
        var haulers = _.filter(Game.creeps, function (c) { return c.memory.role === 'hauler'; });
        var upgraders = _.filter(Game.creeps, function (c) { return c.memory.role === 'upgrader'; });

        var freeSlots = sourceRegistry.totalFreeSlots(room);
        if (freeSlots > 0 && miners.length < 4) {
            var pick = bestBodyFor(MINER_BODIES, available);
            if (available >= pick.cost) {
                if (spawnBody(spawn, pick.body, 'Miner' + Game.time, 'miner')) return;
            }
        }
        if (haulers.length < HAULER_TARGET) {
            var hpick = bestBodyFor(HAULER_BODIES, available);
            if (available >= hpick.cost) {
                if (spawnBody(spawn, hpick.body, 'Hauler' + Game.time, 'hauler')) return;
            } else { debug('hauler cost ' + hpick.cost + ' > available ' + available); return; }
        }
        if (upgraders.length < UPGRADER_TARGET) {
            var wbody = WORKER_BODY;
            if (available < WORKER_BODY_ENERGY) wbody = EARLY_WORKER_BODY;
            var cost = (wbody === EARLY_WORKER_BODY) ? EARLY_WORKER_BODY_ENERGY : WORKER_BODY_ENERGY;
            if (available >= cost) {
                if (spawnBody(spawn, wbody, 'Upgrader' + Game.time, 'upgrader')) return;
            } else { debug('upgrader cost ' + cost + ' > available ' + available); return; }
        }
        debug('RCL>=3: nothing to spawn (miners=' + miners.length + ', haulers=' + haulers.length + ', upgraders=' + upgraders.length + ', freeSlots=' + freeSlots + ')');
        return;
    }

    var role = pickGeneralistRole();
    if (!role) { debug('RCL<3: at target (harv/upg)'); return; }
    var body = WORKER_BODY;
    var bodyEnergy = WORKER_BODY_ENERGY;
    var harvesters = _.filter(Game.creeps, function (c) { return c.memory.role === 'harvester'; });
    if (harvesters.length <= 2) {
        body = EARLY_WORKER_BODY;
        bodyEnergy = EARLY_WORKER_BODY_ENERGY;
    }
    if (available < bodyEnergy) { debug('RCL<3: body cost ' + bodyEnergy + ' > available ' + available); return; }
    var name = (role === 'upgrader' ? 'Upgrader' : 'Harvester') + Game.time;
    spawnBody(spawn, body, name, role);
}

var _debugLast = 0;
function debug(msg) {
    if (Game.time - _debugLast < 20) return;
    _debugLast = Game.time;
    console.log('[spawn] ' + msg);
}

function pickGeneralistRole() {
    var harvesters = _.filter(Game.creeps, function (c) { return c.memory.role === 'harvester'; });
    var upgraders = _.filter(Game.creeps, function (c) { return c.memory.role === 'upgrader'; });
    if (harvesters.length < HARVESTER_TARGET) return 'harvester';
    if (upgraders.length < UPGRADER_TARGET) return 'upgrader';
    return null;
}

module.exports = {
    tick: tick,
};
