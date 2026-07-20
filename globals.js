var ROOM_TICK_SAMPLE_INTERVAL = 20;
var assert = require('assert');

function init() {
    assert.init();
    if (Memory.migrated === 2) return;
    delete Memory.knownSources;
    delete Memory.sourceToSource;
    delete Memory.pathCache;
    Memory.migrated = 2;
}

function ensureRoomMemory(room) {
    if (!room) return null;
    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[room.name]) {
        Memory.rooms[room.name] = {
            lastSeen: Game.time,
            rcl: room.controller ? room.controller.level : 0,
            lastSampled: 0,
        };
    }
    return Memory.rooms[room.name];
}

function tick() {
    init();
    for (var name in Game.rooms) {
        var room = Game.rooms[name];
        if (!room.controller || !room.controller.my) continue;
        var mem = ensureRoomMemory(room);
        mem.lastSeen = Game.time;
        mem.rcl = room.controller.level;
    }
}

module.exports = {
    tick: tick,
    ensureRoomMemory: ensureRoomMemory,
};
