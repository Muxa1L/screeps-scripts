function nearestSpawn(creep) {
    var spawns = [];
    for (var sn in Game.spawns) spawns.push(Game.spawns[sn]);
    if (spawns.length === 0) return null;
    if (spawns.length === 1) return spawns[0];
    var best = null;
    var bestRange = Infinity;
    for (var i = 0; i < spawns.length; i++) {
        var s = spawns[i];
        if (s.pos.roomName !== creep.pos.roomName) continue;
        var r = creep.pos.getRangeTo(s);
        if (r < bestRange) {
            bestRange = r;
            best = s;
        }
    }
    if (best) return best;
    var sameRoom = [];
    for (var j = 0; j < spawns.length; j++) {
        if (spawns[j].pos.roomName === creep.pos.roomName) sameRoom.push(spawns[j]);
    }
    if (sameRoom.length > 0) return sameRoom[0];
    return spawns[0];
}

function leastBusySpawn(room) {
    var candidates = [];
    for (var sn in Game.spawns) {
        var s = Game.spawns[sn];
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
    var out = [];
    for (var sn in Game.spawns) {
        if (Game.spawns[sn].room.name === room.name) out.push(Game.spawns[sn]);
    }
    return out;
}

module.exports = {
    nearestSpawn: nearestSpawn,
    leastBusySpawn: leastBusySpawn,
    spawnsInRoom: spawnsInRoom,
};