const SLOT_TILES = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],           [1, 0],
    [-1, 1],  [0, 1],  [1, 1],
];

function tileIsWalkable(pos) {
    const structs = pos.lookFor(LOOK_STRUCTURES);
    for (let i = 0; i < structs.length; i++) {
        const st = structs[i].structureType;
        if (st !== STRUCTURE_ROAD && st !== STRUCTURE_CONTAINER && st !== STRUCTURE_RAMPART) {
            return false;
        }
    }
    return true;
}

function computeSlots(room, source) {
    const slots = [];
    for (let i = 0; i < SLOT_TILES.length; i++) {
        const dx = SLOT_TILES[i][0];
        const dy = SLOT_TILES[i][1];
        const x = source.pos.x + dx;
        const y = source.pos.y + dy;
        if (x < 0 || x > 49 || y < 0 || y > 49) continue;
        const pos = new RoomPosition(x, y, room.name);
        const terrain = pos.lookFor(LOOK_TERRAIN);
        if (terrain[0] === 'wall') continue;
        if (!tileIsWalkable(pos)) continue;
        slots.push({ x: x, y: y, claimedBy: null });
    }
    return slots;
}

function recomputeSlots(room, src) {
    // Match by stored source id rather than object reference, which was always failing.
    const sourceId = Object.keys(Memory.sources).find(function (id) {
        return Memory.sources[id] === src;
    });
    if (!sourceId) return;
    const source = Game.getObjectById(sourceId);
    if (!source) return;
    const fresh = computeSlots(room, source);
    for (let i = 0; i < fresh.length; i++) {
        const match = src.slots.find(function (s) { return s.x === fresh[i].x && s.y === fresh[i].y; });
        if (match) fresh[i].claimedBy = match.claimedBy;
    }
    src.slots = fresh;
}

function ensureRegistry(room) {
    if (!Memory.sources) Memory.sources = {};
    const sources = room.find(FIND_SOURCES);
    for (let i = 0; i < sources.length; i++) {
        const src = sources[i];
        if (!Memory.sources[src.id]) {
            Memory.sources[src.id] = {
                roomName: room.name,
                x: src.pos.x,
                y: src.pos.y,
                slots: computeSlots(room, src),
            };
        } else if (Game.time % 500 === 0) {
            recomputeSlots(room, Memory.sources[src.id]);
        }
    }
    return Memory.sources;
}

function freeSlot(sourceId) {
    if (!Memory.sources || !Memory.sources[sourceId]) return null;
    const src = Memory.sources[sourceId];
    for (let i = 0; i < src.slots.length; i++) {
        const slot = src.slots[i];
        if (!slot.claimedBy || !Game.creeps[slot.claimedBy]) {
            return slot;
        }
    }
    return null;
}

function claimSlot(sourceId, creepName) {
    if (!Memory.sources || !Memory.sources[sourceId]) return false;
    const src = Memory.sources[sourceId];
    for (let i = 0; i < src.slots.length; i++) {
        const slot = src.slots[i];
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
    for (const id in Memory.sources) {
        const src = Memory.sources[id];
        for (let i = 0; i < src.slots.length; i++) {
            if (src.slots[i].claimedBy === creepName) {
                src.slots[i].claimedBy = null;
            }
        }
    }
}

function slotPos(sourceId, creepName) {
    if (!Memory.sources || !Memory.sources[sourceId]) return null;
    const src = Memory.sources[sourceId];
    for (let i = 0; i < src.slots.length; i++) {
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
