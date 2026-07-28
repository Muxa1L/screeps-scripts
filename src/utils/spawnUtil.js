function nearestSpawn(creep) {
    const spawns = [];
    for (const sn in Game.spawns) spawns.push(Game.spawns[sn]);
    if (spawns.length === 0) return null;
    if (spawns.length === 1) return spawns[0];
    let best = null;
    let bestRange = Infinity;
    for (let i = 0; i < spawns.length; i++) {
        const s = spawns[i];
        if (s.pos.roomName !== creep.pos.roomName) continue;
        const r = creep.pos.getRangeTo(s);
        if (r < bestRange) {
            bestRange = r;
            best = s;
        }
    }
    if (best) return best;
    // Foreign room: no spawn shares the creep's room. Fall back to linear
    // room distance so a 1-hop neighbor wins over a 3-hop one; the previous
    // "sameRoom" loop was unreachable here (same predicate as the best loop)
    // and fell through to whichever spawn `for…in` hit first.
    let crossBest = null;
    let crossRange = Infinity;
    for (let i = 0; i < spawns.length; i++) {
        const d = Game.map.getRoomLinearDistance(creep.pos.roomName, spawns[i].pos.roomName);
        if (d < crossRange) {
            crossRange = d;
            crossBest = spawns[i];
        }
    }
    return crossBest;
}

function leastBusySpawn(room) {
    const candidates = [];
    for (const sn in Game.spawns) {
        const s = Game.spawns[sn];
        if (s.room.name !== room.name) continue;
        if (s.spawning) continue;
        candidates.push(s);
    }
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    candidates.sort(function (a, b) { return b.room.energyAvailable - a.room.energyAvailable; });
    return candidates[0];
}

function spawnsInRoom(room) {
    const out = [];
    for (const sn in Game.spawns) {
        if (Game.spawns[sn].room.name === room.name) out.push(Game.spawns[sn]);
    }
    return out;
}

function nearestSpawnInRoom(creep, roomName) {
    const spawns = [];
    for (const sn in Game.spawns) {
        if (Game.spawns[sn].room.name === roomName) spawns.push(Game.spawns[sn]);
    }
    if (spawns.length === 0) return null;
    if (spawns.length === 1) return spawns[0];
    let best = null;
    let bestRange = Infinity;
    for (let i = 0; i < spawns.length; i++) {
        const r = creep.pos.getRangeTo(spawns[i]);
        if (r < bestRange) {
            bestRange = r;
            best = spawns[i];
        }
    }
    return best;
}

module.exports = {
    nearestSpawn: nearestSpawn,
    leastBusySpawn: leastBusySpawn,
    spawnsInRoom: spawnsInRoom,
    nearestSpawnInRoom: nearestSpawnInRoom,
};