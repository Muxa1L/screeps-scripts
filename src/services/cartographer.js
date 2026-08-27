// cartographer — periodic room scanning and intel write/read.
//
// RCL5 doesn't need this for survival (we own one room, see it live). At
// RCL6+ the cartographer becomes the source of truth for which neighbouring
// rooms are claimable, hostile, or have deposits. Without it the
// scout/claimer pipeline has no target to act on.
//
// Design:
//   - The room scanner picks one unvisited neighbour per tick (cursor in
//     Memory.intel.scanCursor) and dispatches a scout there.
//   - The scout visits the room, scans for sources/hostiles/owner, and
//     writes the result to Memory.intel.rooms[roomName].
//   - Other modules (claimers, remote mining) read from Memory.intel to
//     decide where to go.
//
// RCL5 behaviour: scanCursor never advances because we never spawn scouts
// (no scout role yet). The API is noop-shaped so other code can already
// call it without crashing.

const roomManager = require('../managers/roomManager');

// Per-room intel TTL. Rescan after this many ticks to catch owner changes.
const INTEL_TTL = 50000;

// Queue of room names we want intel on. The scanner drains one per tick.
function enqueue(roomName) {
    if (!roomName) return;
    if (typeof Memory === 'undefined') return;
    if (!Memory.intel) Memory.intel = { queue: [], scanCursor: 0, raids: {}, rooms: {} };
    if (!Memory.intel.queue) Memory.intel.queue = [];
    if (Memory.intel.queue.indexOf(roomName) !== -1) return;
    if (Memory.intel.rooms && Memory.intel.rooms[roomName] &&
        (Game.time - (Memory.intel.rooms[roomName].scannedAt || 0)) < INTEL_TTL) {
        return; // fresh enough, no need to re-queue
    }
    Memory.intel.queue.push(roomName);
}

function dequeue() {
    if (!Memory.intel || !Memory.intel.queue || Memory.intel.queue.length === 0) return null;
    return Memory.intel.queue.shift();
}

function getIntel(roomName) {
    if (!Memory.intel || !Memory.intel.rooms) return null;
    return Memory.intel.rooms[roomName] || null;
}

function writeIntel(roomName, data) {
    if (!roomName || typeof Memory === 'undefined') return;
    if (!Memory.intel) Memory.intel = { queue: [], scanCursor: 0, raids: {}, rooms: {} };
    if (!Memory.intel.rooms) Memory.intel.rooms = {};
    Memory.intel.rooms[roomName] = Object.assign({}, data, { scannedAt: Game.time });
}

function isFresh(roomName) {
    const info = getIntel(roomName);
    if (!info) return false;
    return (Game.time - (info.scannedAt || 0)) < INTEL_TTL;
}

// Build the list of room names we own, plus their 8 neighbours. Owners are
// the primary intel source so other modules don't have to compute exits.
function neighbourRooms(homeRoomName) {
    if (!homeRoomName) return [];
    const m = homeRoomName.match(/([EW])(\d+)([NS])(\d+)/);
    if (!m) return [];
    const fx = m[1] === 'W' ? -1 : 1;
    const fy = m[3] === 'N' ? -1 : 1;
    const x = parseInt(m[2], 10) * fx;
    const y = parseInt(m[4], 10) * fy;
    const out = [];
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            const ew = nx < 0 ? 'W' : 'E';
            const ns = ny < 0 ? 'N' : 'S';
            out.push(ew + Math.abs(nx) + ns + Math.abs(ny));
        }
    }
    return out;
}

function recordOwnership(roomName) {
    const room = Game.rooms[roomName];
    if (!room) return;
    const controller = room.controller;
    const info = {
        owner: controller && controller.owner ? controller.owner.username : null,
        reservation: controller && controller.reservation ?
            controller.reservation.username : null,
        safeMode: controller ? controller.safeMode : 0,
        sources: room.find(FIND_SOURCES).map(function (s) { return s.id; }),
        hostileCount: room.find(FIND_HOSTILE_CREEPS).length,
    };
    writeIntel(roomName, info);
}

module.exports = {
    enqueue: enqueue,
    dequeue: dequeue,
    getIntel: getIntel,
    writeIntel: writeIntel,
    isFresh: isFresh,
    neighbourRooms: neighbourRooms,
    recordOwnership: recordOwnership,
    INTEL_TTL: INTEL_TTL,
};
