const memory = require('../utils/memorySchema');
const constants = require('../config/constants');

const INTERVAL = constants.EXPANSION_PLANNING_INTERVAL;
const VETO_TICKS = constants.EXPANSION_VETO_TICKS;
const MIN_GCL = constants.EXPANSION_MIN_GCL;
const MIN_HOME_RCL = constants.EXPANSION_MIN_HOME_RCL;
const SEARCH_DEPTH = constants.EXPANSION_SEARCH_DEPTH;
const MAX_CANDIDATES = constants.EXPANSION_MAX_CANDIDATES;

function ownedRoomCount() {
    let count = 0;
    for (const name in Game.rooms) {
        const r = Game.rooms[name];
        if (r.controller && r.controller.my) count++;
    }
    return count;
}

function availableSlots() {
    const gcl = Game.gcl ? Game.gcl.level : 1;
    return Math.max(0, gcl - ownedRoomCount());
}

function isHighway(roomName) {
    const coords = roomName.match(/[EW](\d+)[NS](\d+)/);
    if (!coords) return true;
    return parseInt(coords[1], 10) % 10 === 0 || parseInt(coords[2], 10) % 10 === 0;
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
    // Treat any non-self reservation as a blocker for v1.
    const me = memory.myUsername();
    return res.username !== me;
}

function alreadyRemoteTarget(roomName) {
    const rr = memory.getRemoteRooms();
    if (rr && rr[roomName] && rr[roomName].status !== 'abandoned') return true;
    return false;
}

// Breadth-first expansion of neighbors up to SEARCH_DEPTH, skipping highway
// rooms, owned-by-other rooms, and rooms reserved by non-allies.
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
    while (frontier.length > 0 && candidates.length < MAX_CANDIDATES) {
        const cur = frontier.shift();
        if (cur.depth > SEARCH_DEPTH) continue;
        if (isHighway(cur.name)) continue;
        if (isOwnedByOther(cur.name)) continue;
        if (isReservedByNonAlly(cur.name)) continue;
        if (alreadyRemoteTarget(cur.name)) continue;
        candidates.push(cur.name);
        if (cur.depth < SEARCH_DEPTH) {
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
        if (d < best) best = d;
    }
    return best === Infinity ? 99 : best;
}

function sourceCount(roomName) {
    const room = Game.rooms[roomName];
    if (!room) return 0;
    const sources = room.find(FIND_SOURCES);
    return sources ? sources.length : 0;
}

function swampRatio(roomName) {
    // Without terrain data we can't compute this precisely; the snapshot
    // exposes a terrain summary only for visible rooms. v1 uses 0 (no
    // penalty) when the room isn't visible; the planner will see the room
    // on the next scan once an observer observes it.
    const room = Game.rooms[roomName];
    if (!room) return 0;
    if (typeof room.find === 'function') {
        // Approximate via terrain lookup on a few sampled tiles. Cheap.
        let swamps = 0;
        let total = 0;
        for (let x = 10; x <= 40; x += 5) {
            for (let y = 10; y <= 40; y += 5) {
                const p = new RoomPosition(x, y, roomName);
                const t = p.lookFor(LOOK_TERRAIN);
                if (t && t[0] === 'swamp') swamps++;
                total++;
            }
        }
        return total > 0 ? swamps / total : 0;
    }
    return 0;
}

function mineralPenalty(roomName) {
    // Avoid minerals we already mine. Without a mineral registry, v1 returns 0;
    // a future version can consult a Memory.minerals map.
    return 0;
}

function scoreCandidate(roomName) {
    const sources = sourceCount(roomName);
    const dist = distanceFromNearestOwned(roomName);
    const swamp = swampRatio(roomName);
    const mineral = mineralPenalty(roomName);
    return sources * 1000 - dist * 100 - mineral - swamp * 200;
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
    return best ? { roomName: best, score: bestScore } : null;
}

// A room counts as recently failed if its last history entry has no
// claimedTick and the attempt happened within CLAIM_RETRY_COOLDOWN ticks.
function recentlyFailed(roomName) {
    const COOLDOWN = 30000; // ~1.5 h of game time; long enough to not churn claimers
    const exp = memory.getExpansion();
    if (!exp || !exp.history) return false;
    for (let i = exp.history.length - 1; i >= 0; i--) {
        const entry = exp.history[i];
        if (entry.roomName !== roomName) continue;
        // Most recent entry for this room decides.
        if (entry.claimedTick) return false;
        return Game.time - (entry.abandonedTick || 0) < COOLDOWN;
    }
    return false;
}

function tick() {
    if (!Memory.flags || !Memory.flags.expansion) return;
    if (Game.time % INTERVAL !== 0 && !(Game.shard && Game.shard.name === 'sim')) return;
    if (Game.cpu.bucket < 1000 && !(Game.shard && Game.shard.name === 'sim')) return;

    const exp = memory.ensureExpansion();

    // If we already have a target, honor the veto window or proceed.
    if (exp.target && exp.target.roomName) {
        const t = exp.target;
        if (Game.time - t.plannedTick < VETO_TICKS) {
            // Veto window still open. Cancel if the ClaimTarget flag was removed.
            const flag = Game.flags && Game.flags['ClaimTarget' + t.roomName];
            if (!flag) {
                memory.addExpansionHistory({ roomName: t.roomName, claimedTick: null, abandonedTick: Game.time, reason: 'vetoed' });
                delete exp.target;
            }
            return;
        }
        // Veto window closed; the bootstrap/claim pipeline takes over. Don't
        // pick a new target until the current one is resolved.
        return;
    }

    // GCL / RCL gating.
    if (!Game.gcl || Game.gcl.level < MIN_GCL) return;
    if (availableSlots() <= 0) return;
    let qualifies = false;
    for (const name in Game.rooms) {
        const r = Game.rooms[name];
        if (!r.controller || !r.controller.my) continue;
        if (r.controller.level >= MIN_HOME_RCL) { qualifies = true; break; }
    }
    if (!qualifies) return;

    // Skip rooms that recently failed an expansion attempt (vetoed,
    // enemy-claimed, invalid-target). Without this the planner immediately
    // re-picks the same failing room and the claimer shuttles until TTL death.
    const candidates = findCandidates().filter(function (name) { return !recentlyFailed(name); });
    if (candidates.length === 0) return;
    const best = pickBest(candidates);
    if (!best) return;

    exp.target = {
        roomName: best.roomName,
        score: best.score,
        plannedTick: Game.time,
        vetoUntil: Game.time + VETO_TICKS,
    };
    // Plant a ClaimTarget flag in the candidate room so the player can see and
    // veto. Use the controller position if visible, else room center.
    if (Game.flags && !Game.flags['ClaimTarget' + best.roomName]) {
        const room = Game.rooms[best.roomName];
        let pos;
        if (room && room.controller) {
            pos = new RoomPosition(room.controller.pos.x, room.controller.pos.y, best.roomName);
        } else {
            pos = new RoomPosition(25, 25, best.roomName);
        }
        try { pos.createFlag('ClaimTarget' + best.roomName, COLOR_PURPLE, COLOR_PURPLE); }
        catch (e) { /* ignore - flag may already exist or room not visible */ }
    }
}

module.exports = {
    tick: tick,
    findCandidates: findCandidates,
    scoreCandidate: scoreCandidate,
    pickBest: pickBest,
    availableSlots: availableSlots,
    ownedRoomCount: ownedRoomCount,
    isHighway: isHighway,
};