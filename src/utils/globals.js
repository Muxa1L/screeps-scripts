const assert = require('./assert');

function init() {
    assert.init();
    if (Memory.migrated === 4) return;
    delete Memory.knownSources;
    delete Memory.sourceToSource;
    delete Memory.pathCache;
    if (!Memory.intel) Memory.intel = { queue: [], scanCursor: 0, raids: {} };
    if (!Memory.squads) Memory.squads = {};
    if (!Memory.remoteRooms) Memory.remoteRooms = {};
    if (!Memory.expansion) Memory.expansion = { history: [] };
    if (!Memory.flags) Memory.flags = {};
    if (Memory.flags.squads === undefined) Memory.flags.squads = false;
    if (Memory.flags.intel === undefined) Memory.flags.intel = false;
    if (Memory.flags.remoteMining === undefined) Memory.flags.remoteMining = false;
    if (Memory.flags.expansion === undefined) Memory.flags.expansion = false;
    Memory.migrated = 4;
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
    for (const name in Game.rooms) {
        const room = Game.rooms[name];
        if (!room.controller || !room.controller.my) continue;
        const mem = ensureRoomMemory(room);
        mem.lastSeen = Game.time;
    }
}

module.exports = {
    tick: tick,
    ensureRoomMemory: ensureRoomMemory,
};
