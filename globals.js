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
    }
}

module.exports = {
    tick: tick,
    ensureRoomMemory: ensureRoomMemory,
};
