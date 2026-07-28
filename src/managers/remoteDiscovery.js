'use strict';

// Auto-discovery for remote mining targets. Replaces manual RemoteTarget<n>
// flag placement with scoring-based auto-discovery. Walks the neighbor graph
// of every owned room up to depth 2, scores candidates, and seeds
// Memory.remoteRooms with the best ones. The existing remoteManager pipeline
// then takes over (scout / reserve / build / mine / haul / defend).
//
// Gated on Memory.flags.remoteMining and remotePrerequisitesMet() (RCL >= 4,
// observer present, >= 2 home sources claimed).

const constants = require('../config/constants');
const memory = require('../utils/memorySchema');
const creepsQuotas = require('../economy/creepsQuotas');
const expansionPlanner = require('./expansionPlanner');

const INTERVAL = constants.REMOTE_DISCOVERY_INTERVAL;
const CAP = constants.REMOTE_AUTO_DISCOVERY_CAP;
const MIN_DISTANCE = constants.REMOTE_AUTO_MIN_DISTANCE;
const VETO_TICKS = constants.REMOTE_AUTO_VETO_TICKS;

function isHighway(roomName) {
    return expansionPlanner.isHighway(roomName);
}

function isOwnedByOther(roomName) {
    const room = Game.rooms[roomName];
    if (!room || !room.controller) return false;
    if (room.controller.my) return false;
    if (room.controller.owner) return true;
    return false;
}

function isReservedByNonAlly(roomName) {
    const room = Game.rooms[roomName];
    if (!room || !room.controller) return false;
    const res = room.controller.reservation;
    if (!res) return false;
    const me = Game.username || null;
    return res.username !== me;
}

function alreadyRemoteTarget(roomName) {
    const rr = memory.getRemoteRooms();
    if (rr && rr[roomName] && rr[roomName].status !== 'abandoned') return true;
    return false;
}

function isExpansionTarget(roomName) {
    const exp = memory.getExpansion();
    if (exp && exp.target && exp.target.roomName === roomName) return true;
    return false;
}

function homeRoomForRemote(roomName) {
    let best = null;
    let bestDist = Infinity;
    for (const name in Game.rooms) {
        const r = Game.rooms[name];
        if (!r.controller || !r.controller.my) continue;
        const d = Game.map.getRoomLinearDistance(name, roomName);
        if (typeof d === 'number' && d < bestDist) {
            bestDist = d;
            best = name;
        }
    }
    return best;
}

// Breadth-first neighbor scan up to depth 2, mirroring expansionPlanner
// but with additional dedup against expansion targets.
function findCandidates() {
    const seen = {};
    const frontier = [];
    for (const name in Game.rooms) {
        const r = Game.rooms[name];
        if (!r.controller || !r.controller.my) continue;
        seen[name] = true;
        const exits = Game.map.describeExits(name) || {};
        for (const dir in exits) {
            const nb = exits[dir];
            if (!seen[nb]) { seen[nb] = true; frontier.push({ name: nb, depth: 1 }); }
        }
    }
    const candidates = [];
    while (frontier.length > 0) {
        const cur = frontier.shift();
        if (cur.depth > 2) continue;
        if (isHighway(cur.name)) continue;
        if (isOwnedByOther(cur.name)) continue;
        if (isReservedByNonAlly(cur.name)) continue;
        if (alreadyRemoteTarget(cur.name)) continue;
        if (isExpansionTarget(cur.name)) continue;
        // Skip rooms too close to home (those are expansion candidates, not remote)
        const dist = distanceFromNearestOwned(cur.name);
        if (dist < MIN_DISTANCE) continue;
        candidates.push(cur.name);
        if (cur.depth < 2) {
            const exits = Game.map.describeExits(cur.name) || {};
            for (const dir in exits) {
                const nb = exits[dir];
                if (!seen[nb]) { seen[nb] = true; frontier.push({ name: nb, depth: cur.depth + 1 }); }
            }
        }
    }
    return candidates;
}

function distanceFromNearestOwned(roomName) {
    let best = Infinity;
    for (const name in Game.rooms) {
        const r = Game.rooms[name];
        if (!r.controller || !r.controller.my) continue;
        const d = Game.map.getRoomLinearDistance(name, roomName);
        if (typeof d === 'number' && d < best) best = d;
    }
    return best === Infinity ? 99 : best;
}

function sourceCount(roomName) {
    const room = Game.rooms[roomName];
    if (!room) return 0;
    const sources = room.find(FIND_SOURCES);
    return sources ? sources.length : 0;
}

function scoreCandidate(roomName) {
    const sources = sourceCount(roomName);
    const dist = distanceFromNearestOwned(roomName);
    return sources * 1000 - dist * 100;
}

function pickBest(candidates) {
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
        const s = scoreCandidate(candidates[i]);
        if (s > bestScore) {
            bestScore = s;
            best = candidates[i];
        }
    }
    return best;
}

function ensureRemoteRoom(roomName) {
    const rr = memory.ensureRemoteRooms();
    if (rr[roomName]) return;
    rr[roomName] = {
        target: roomName,
        status: 'pending',
        scoutedTick: 0,
        reservationExpires: 0,
        sourceIds: [],
        containerSiteIds: [],
        containerIds: [],
        roadSiteIds: [],
        threats: [],
        homeRoom: homeRoomForRemote(roomName),
        autoDiscovered: true,
        discoveredTick: Game.time,
        vetoUntil: Game.time + VETO_TICKS,
    };
}

function countAutoDiscovered() {
    const rr = memory.getRemoteRooms();
    let count = 0;
    for (const name in rr) {
        if (rr[name].autoDiscovered && rr[name].status !== 'abandoned') count++;
    }
    return count;
}

function tick() {
    if (!Memory.flags || !Memory.flags.remoteMining) return;
    if (Game.time % INTERVAL !== 0 && !(Game.shard && Game.shard.name === 'sim')) return;
    if (Game.cpu.bucket < 5000 && !(Game.shard && Game.shard.name === 'sim')) return;
    if (!creepsQuotas.remotePrerequisitesMet()) return;

    // Don't exceed the auto-discovery cap
    if (countAutoDiscovered() >= CAP) return;

    const candidates = findCandidates();
    if (candidates.length === 0) return;
    const best = pickBest(candidates);
    if (!best) return;

    ensureRemoteRoom(best);
    console.log('[' + Game.time + '] [remote-discovery] auto-discovered ' + best +
        ' (score=' + scoreCandidate(best) + ')');
}

module.exports = {
    tick: tick,
    findCandidates: findCandidates,
    scoreCandidate: scoreCandidate,
    pickBest: pickBest,
    ensureRemoteRoom: ensureRemoteRoom,
    countAutoDiscovered: countAutoDiscovered,
    isHighway: isHighway,
    isOwnedByOther: isOwnedByOther,
    isReservedByNonAlly: isReservedByNonAlly,
    alreadyRemoteTarget: alreadyRemoteTarget,
    isExpansionTarget: isExpansionTarget,
};