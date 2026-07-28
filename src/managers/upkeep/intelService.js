const memory = require('../../utils/memorySchema');
const roomManager = require('../roomManager');
const constants = require('../../config/constants');

const INTEL_RAID_HOSTILE_THRESHOLD = constants.INTEL_RAID_HOSTILE_THRESHOLD;
const INTEL_RAID_NEARBY_DISTANCE = constants.INTEL_RAID_NEARBY_DISTANCE;
const INTEL_RAID_DECAY_TICKS = constants.INTEL_RAID_DECAY_TICKS;
const INTEL_QUEUE_REFRESH_TICKS = constants.INTEL_QUEUE_REFRESH_TICKS;

function isOwnedRoom(roomName) {
    const room = Game.rooms[roomName];
    return !!(room && room.controller && room.controller.my);
}

function isHighway(roomName) {
    // Highway rooms have at least one coordinate divisible by 10.
    const coords = roomName.match(/[EW](\d+)[NS](\d+)/);
    if (!coords) return true;
    return parseInt(coords[1], 10) % 10 === 0 || parseInt(coords[2], 10) % 10 === 0;
}

function buildQueue() {
    const queue = [];
    const seen = {};
    for (const name in Game.rooms) {
        if (!isOwnedRoom(name)) continue;
        const exits = Game.map.describeExits(name);
        for (const dir in exits) {
            const neighbor = exits[dir];
            if (seen[neighbor] || isHighway(neighbor)) continue;
            seen[neighbor] = true;
            queue.push(neighbor);
        }
    }
    // Also include any existing intel rooms that have gone stale so they stay observed.
    const intel = memory.getIntel();
    if (intel && intel.rooms) {
        const entries = [];
        for (const rn in intel.rooms) {
            entries.push({ name: rn, lastSeen: intel.rooms[rn].lastSeen || 0 });
        }
        entries.sort(function (a, b) { return a.lastSeen - b.lastSeen; });
        for (let i = 0; i < entries.length; i++) {
            if (!seen[entries[i].name]) queue.push(entries[i].name);
        }
    }
    return queue;
}

function ensureQueueFresh(intel) {
    const refresh = !intel.queue ||
        intel.queue.length === 0 ||
        Game.time % INTEL_QUEUE_REFRESH_TICKS === 0;
    if (refresh) {
        intel.queue = buildQueue();
        intel.scanCursor = 0;
    }
}

function findObserver(room) {
    const structures = room.find(FIND_STRUCTURES);
    for (let i = 0; i < structures.length; i++) {
        if (structures[i].structureType === STRUCTURE_OBSERVER) return structures[i];
    }
    return null;
}

function recordIntel(roomName, snap) {
    const intel = memory.getIntel();
    const rooms = memory.ensureIntelRooms();
    const room = Game.rooms[roomName];
    const controller = room ? room.controller : null;
    rooms[roomName] = {
        lastSeen: Game.time,
        owner: controller && controller.owner ? controller.owner.username : null,
        reservation: controller && controller.reservation ? controller.reservation.username : null,
        hostiles: snap ? snap.hostiles.length : 0,
        hostileStructures: snap ? (snap.hostileStructures ? snap.hostileStructures.length : 0) : 0,
        sources: snap && snap.sources ? snap.sources.map(function (s) { return s.id; }) : [],
    };

    // Raid detection: significant hostile presence near any owned room.
    if (snap && snap.hostiles.length >= INTEL_RAID_HOSTILE_THRESHOLD) {
        let nearOwned = false;
        for (const ownedName in Game.rooms) {
            if (!isOwnedRoom(ownedName)) continue;
            const dist = Game.map.getRoomLinearDistance(roomName, ownedName);
            if (dist <= INTEL_RAID_NEARBY_DISTANCE) { nearOwned = true; break; }
        }
        if (nearOwned) {
            intel.raids = intel.raids || {};
            intel.raids[roomName] = {
                detectedTick: Game.time,
                threatLevel: snap.hostiles.length,
            };
        }
    }
}

function decayRaids(intel) {
    if (!intel.raids) return;
    const now = Game.time;
    for (const rn in intel.raids) {
        const raid = intel.raids[rn];
        const entry = intel.rooms && intel.rooms[rn];
        const lastSeen = entry ? entry.lastSeen : 0;
        if (now - Math.max(raid.detectedTick, lastSeen) > INTEL_RAID_DECAY_TICKS) {
            delete intel.raids[rn];
        }
    }
}

function tick() {
    if (!Memory.flags || !Memory.flags.intel) return;
    const intel = memory.ensureIntel();
    ensureQueueFresh(intel);
    decayRaids(intel);

    if (!intel.queue || intel.queue.length === 0) return;

    // Collect every observer across all owned rooms so each observer can
    // scan one target per tick (Screeps limit is one observation per observer).
    const observers = [];
    for (const name in Game.rooms) {
        if (!isOwnedRoom(name)) continue;
        const obs = findObserver(Game.rooms[name]);
        if (obs) observers.push(obs);
    }
    if (observers.length === 0) return;

    const pendingScans = [];
    const alreadyPending = {};
    if (intel._pendingScans) {
        for (let p = 0; p < intel._pendingScans.length; p++) {
            alreadyPending[intel._pendingScans[p]] = true;
        }
    }
    for (let i = 0; i < observers.length; i++) {
        if (intel.scanCursor === undefined || intel.scanCursor === null) intel.scanCursor = 0;
        const cursor = intel.scanCursor % intel.queue.length;
        const targetName = intel.queue[cursor];
        intel.scanCursor = cursor + 1;
        const res = observers[i].observeRoom(targetName);
        if (res === OK) {
            // Dedup so a room that's still pending (not yet visible from a
            // previous tick's scan) isn't pushed again — without this the
            // same room can be scanned multiple times before it becomes
            // visible, and recordIntel runs twice on the same tick (wasted work).
            if (!alreadyPending[targetName]) {
                pendingScans.push(targetName);
                alreadyPending[targetName] = true;
            }
        }
    }
    if (pendingScans.length > 0) {
        intel._pendingScans = (intel._pendingScans || []).concat(pendingScans);
    }

    // If any previously scanned rooms are now visible, record their intel.
    if (intel._pendingScans && intel._pendingScans.length > 0) {
        const stillPending = [];
        for (let i = 0; i < intel._pendingScans.length; i++) {
            const roomName = intel._pendingScans[i];
            if (Game.rooms[roomName]) {
                const snap = roomManager.get(roomName);
                recordIntel(roomName, snap);
            } else {
                stillPending.push(roomName);
            }
        }
        intel._pendingScans = stillPending;
    }
}

module.exports = {
    tick: tick,
    recordIntel: recordIntel,
    buildQueue: buildQueue,
    decayRaids: decayRaids,
    isOwnedRoom: isOwnedRoom,
    isHighway: isHighway,
};
