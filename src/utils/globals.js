const assert = require('./assert');

function init() {
    assert.init();
    if (Memory.migrated === 5) return;
    delete Memory.knownSources;
    delete Memory.sourceToSource;
    delete Memory.pathCache;
    // Migrate any legacy per-room intel entries from Memory.intel[roomName]
    // into Memory.intel.rooms[roomName] (separating them from the meta keys).
    if (Memory.intel && !Memory.intel.rooms) {
        const moved = {};
        const metaKeys = { queue: true, scanCursor: true, raids: true, _pendingScan: true, _pendingScans: true };
        for (const k in Memory.intel) {
            if (metaKeys[k]) continue;
            moved[k] = Memory.intel[k];
            delete Memory.intel[k];
        }
        Memory.intel.rooms = moved;
    }
    if (!Memory.intel) Memory.intel = { queue: [], scanCursor: 0, raids: {}, rooms: {} };
    if (!Memory.intel.rooms) Memory.intel.rooms = {};
    if (!Memory.squads) Memory.squads = {};
    if (!Memory.remoteRooms) Memory.remoteRooms = {};
    if (!Memory.expansion) Memory.expansion = { history: [] };
    if (!Memory.expansion.history) Memory.expansion.history = [];
    if (!Memory.flags) Memory.flags = {};
    if (Memory.flags.squads === undefined) Memory.flags.squads = false;
    if (Memory.flags.intel === undefined) Memory.flags.intel = false;
    if (Memory.flags.remoteMining === undefined) Memory.flags.remoteMining = false;
    if (Memory.flags.expansion === undefined) Memory.flags.expansion = false;
    // Back-fill homeRoom on existing creeps to their nearest owned room so
    // multi-room accounting (creepCountByRole by homeRoom) works immediately.
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.memory) c.memory = {};
        if (!c.memory.homeRoom && c.pos && c.pos.roomName) {
            // Default to the first owned room we find; per-room generalization
            // will refine this on the next spawn cycle.
            for (const rn in Game.rooms) {
                const r = Game.rooms[rn];
                if (r.controller && r.controller.my) {
                    c.memory.homeRoom = rn;
                    break;
                }
            }
        }
    }
    Memory.migrated = 5;
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
