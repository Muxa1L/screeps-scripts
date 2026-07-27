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

function isSlotReachable(room, slot) {
    const exitPos = room.find(FIND_EXIT);
    if (!exitPos || exitPos.length === 0) return true;
    // Fast path-reachability check: can we path from an arbitrary exit tile
    // to the slot? Use ignoreCreeps to keep it cheap; any static obstacle still
    // blocks it. Recomputed every 500 ticks alongside slot refresh.
    const start = exitPos[0];
    const end = new RoomPosition(slot.x, slot.y, room.name);
    const path = room.findPath(start, end, { ignoreCreeps: true, maxOps: 200 });
    return path.length > 0 && path[path.length - 1].x === end.x && path[path.length - 1].y === end.y;
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
        slots.push({ x: x, y: y, claimedBy: null, reachable: true });
    }
    return slots;
}

function cleanupDeadClaims(src) {
    if (!src || !src.slots) return;
    for (let i = 0; i < src.slots.length; i++) {
        const name = src.slots[i].claimedBy;
        if (name && !Game.creeps[name]) {
            src.slots[i].claimedBy = null;
        }
    }
}

function recomputeSlots(room, sourceId, src) {
    const source = Game.getObjectById(sourceId);
    if (!source) return;
    const fresh = computeSlots(room, source);
    for (let i = 0; i < fresh.length; i++) {
        const match = src.slots.find(function (s) { return s.x === fresh[i].x && s.y === fresh[i].y; });
        if (match && match.claimedBy && Game.creeps[match.claimedBy]) {
            fresh[i].claimedBy = match.claimedBy;
        }
        if (room.controller && room.controller.my) {
            fresh[i].reachable = isSlotReachable(room, fresh[i]);
        }
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
        } else {
            cleanupDeadClaims(Memory.sources[src.id]);
            if (Game.time % 500 === 0) {
                recomputeSlots(room, src.id, Memory.sources[src.id]);
            }
        }
    }
    return Memory.sources;
}

function registerRemoteSource(room, source) {
    if (!Memory.sources) Memory.sources = {};
    if (Memory.sources[source.id]) return Memory.sources[source.id];
    Memory.sources[source.id] = {
        roomName: room.name,
        x: source.pos.x,
        y: source.pos.y,
        slots: computeSlots(room, source),
        remote: true,
    };
    return Memory.sources[source.id];
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
    // First, check if this creep already has a slot.
    for (let i = 0; i < src.slots.length; i++) {
        if (src.slots[i].claimedBy === creepName) return true;
    }
    // Collect free slots.
    const free = [];
    for (let i = 0; i < src.slots.length; i++) {
        const slot = src.slots[i];
        if (!slot.claimedBy || !Game.creeps[slot.claimedBy]) {
            free.push(slot);
        }
    }
    if (free.length === 0) return false;
    // Prefer the slot closest to a container near this source so the miner
    // can deposit into it without moving. With miners capped at 1-2 per
    // source, slot selection matters: the container-adjacent slot lets the
    // miner offload in-place instead of dropping on the ground.
    const room = Game.rooms[src.roomName];
    if (room) {
        const containers = room.find(FIND_STRUCTURES, {
            filter: function (s) { return s.structureType === STRUCTURE_CONTAINER; },
        });
        if (containers.length > 0) {
            let bestSlot = null;
            let bestDist = Infinity;
            for (let i = 0; i < free.length; i++) {
                const slot = free[i];
                const slotPos = new RoomPosition(slot.x, slot.y, src.roomName);
                for (let j = 0; j < containers.length; j++) {
                    const d = slotPos.getRangeTo(containers[j]);
                    if (d < bestDist) {
                        bestDist = d;
                        bestSlot = slot;
                    }
                }
            }
            if (bestSlot) {
                bestSlot.claimedBy = creepName;
                return true;
            }
        }
    }
    // No container or no container-adjacent slot; claim the first free slot.
    free[0].claimedBy = creepName;
    return true;
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

function countClaims(sourceId) {
    if (!Memory.sources || !Memory.sources[sourceId]) return 0;
    const slots = Memory.sources[sourceId].slots;
    let count = 0;
    for (let i = 0; i < slots.length; i++) {
        if (slots[i].claimedBy && Game.creeps[slots[i].claimedBy]) count++;
    }
    return count;
}

module.exports = {
    ensureRegistry: ensureRegistry,
    registerRemoteSource: registerRemoteSource,
    freeSlot: freeSlot,
    claimSlot: claimSlot,
    releaseClaim: releaseClaim,
    slotPos: slotPos,
    countClaims: countClaims,
    isSlotReachable: isSlotReachable,
};
