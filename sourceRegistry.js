var SLOT_TILES = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],           [1, 0],
    [-1, 1],  [0, 1],  [1, 1],
];

function ensureRegistry(room) {
    if (!Memory.sources) Memory.sources = {};
    var sources = room.find(FIND_SOURCES);
    for (var i = 0; i < sources.length; i++) {
        var src = sources[i];
        if (!Memory.sources[src.id]) {
            Memory.sources[src.id] = {
                roomName: room.name,
                x: src.pos.x,
                y: src.pos.y,
                slots: computeSlots(room, src),
            };
        }
    }
    return Memory.sources;
}

function computeSlots(room, source) {
    var slots = [];
    for (var i = 0; i < SLOT_TILES.length; i++) {
        var dx = SLOT_TILES[i][0];
        var dy = SLOT_TILES[i][1];
        var x = source.pos.x + dx;
        var y = source.pos.y + dy;
        if (x < 0 || x > 49 || y < 0 || y > 49) continue;
        var pos = new RoomPosition(x, y, room.name);
        var terrain = pos.lookFor(LOOK_TERRAIN);
        if (terrain[0] === 'wall') continue;
        slots.push({ x: x, y: y, claimedBy: null });
    }
    return slots;
}

function freeSlot(sourceId) {
    if (!Memory.sources || !Memory.sources[sourceId]) return null;
    var src = Memory.sources[sourceId];
    for (var i = 0; i < src.slots.length; i++) {
        var slot = src.slots[i];
        if (!slot.claimedBy || !Game.creeps[slot.claimedBy]) {
            return slot;
        }
    }
    return null;
}

function claimSlot(sourceId, creepName) {
    if (!Memory.sources || !Memory.sources[sourceId]) return false;
    var src = Memory.sources[sourceId];
    for (var i = 0; i < src.slots.length; i++) {
        var slot = src.slots[i];
        if (slot.claimedBy === creepName) return true;
        if (!slot.claimedBy || !Game.creeps[slot.claimedBy]) {
            slot.claimedBy = creepName;
            return true;
        }
    }
    return false;
}

function releaseClaim(creepName) {
    if (!Memory.sources) return;
    for (var id in Memory.sources) {
        var src = Memory.sources[id];
        for (var i = 0; i < src.slots.length; i++) {
            if (src.slots[i].claimedBy === creepName) {
                src.slots[i].claimedBy = null;
            }
        }
    }
}

function slotPos(sourceId, creepName) {
    if (!Memory.sources || !Memory.sources[sourceId]) return null;
    var src = Memory.sources[sourceId];
    for (var i = 0; i < src.slots.length; i++) {
        if (src.slots[i].claimedBy === creepName) {
            return new RoomPosition(src.slots[i].x, src.slots[i].y, src.roomName);
        }
    }
    return null;
}

module.exports = {
    ensureRegistry: ensureRegistry,
    freeSlot: freeSlot,
    claimSlot: claimSlot,
    releaseClaim: releaseClaim,
    slotPos: slotPos,
};
