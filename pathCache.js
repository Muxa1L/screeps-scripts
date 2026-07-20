var pathCache = Memory.pathCache || { _cache: {}, _lastCleanup: 0 };
Memory.pathCache = pathCache;

function getPath(creepId, targetId) {
    var key = creepId + '_' + targetId;
    var entry = pathCache._cache[key];
    if (entry && Game.time - entry.time < 5) {
        var creep = Game.creeps[creepId];
        if (creep && 
            creep.pos.x === entry.originPos.x && 
            creep.pos.y === entry.originPos.y && 
            creep.pos.roomName === entry.originPos.roomName) {
            return entry.path;
        }
    }
    return null;
}

function storePath(creepId, targetId, path) {
    var key = creepId + '_' + targetId;
    var creep = Game.creeps[creepId];
    if (creep) {
        pathCache._cache[key] = {
            path: path,
            time: Game.time,
            originPos: {x: creep.pos.x, y: creep.pos.y, roomName: creep.pos.roomName}
        };
    }
}

function cleanup() {
    if (Game.time - pathCache._lastCleanup > 10) {
        var currentTime = Game.time;
        for (var key in pathCache._cache) {
            if (pathCache._cache[key].time < currentTime - 5) {
                delete pathCache._cache[key];
            }
        }
        pathCache._lastCleanup = Game.time;
    }
}

module.exports = {
    getPath: getPath,
    storePath: storePath,
    cleanup: cleanup
};