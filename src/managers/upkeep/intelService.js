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
    if (intel) {
        const entries = [];
        for (const rn in intel) {
            if (rn === 'queue' || rn === 'scanCursor' || rn === 'raids') continue;
            entries.push({ name: rn, lastSeen: intel[rn].lastSeen || 0 });
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
    const room = Game.rooms[roomName];
    const controller = room ? room.controller : null;
    intel[roomName] = {
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
        const entry = intel[rn];
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

    let attempts = 0;
    const maxAttempts = Math.min(intel.queue.length, 3);
    while (attempts < maxAttempts) {
        const cursor = intel.scanCursor % intel.queue.length;
        const targetName = intel.queue[cursor];
        intel.scanCursor = cursor + 1;
        attempts++;

        // Find an available observer in an owned room.
        let observer = null;
        for (const name in Game.rooms) {
            if (!isOwnedRoom(name)) continue;
            const obs = findObserver(Game.rooms[name]);
            if (obs) { observer = obs; break; }
        }
        if (!observer) break;

        const res = observer.observeRoom(targetName);
        if (res === OK) {
            // Intel will be recorded next tick when the room becomes visible.
            intel._pendingScan = targetName;
            break;
        }
    }

    // If a previously scanned room is now visible, record its intel.
    if (intel._pendingScan && Game.rooms[intel._pendingScan]) {
        const roomName = intel._pendingScan;
        const snap = roomManager.get(roomName);
        recordIntel(roomName, snap);
        intel._pendingScan = null;
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
