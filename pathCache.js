var cache = {
    _cache: {},
    _lastCleanup: 0,
};

function get(key) {
    var entry = cache._cache[key];
    if (!entry) return null;
    if (Game.time - entry.time > 50) return null;
    return entry;
}

function set(key, path, origin) {
    if (!path || path.length === 0) return;
    cache._cache[key] = {
        time: Game.time,
        path: path,
        idx: 0,
        origin: origin || null,
    };
}

function advance(key) {
    var entry = cache._cache[key];
    if (entry && entry.idx < entry.path.length - 1) entry.idx++;
}

function del(key) {
    delete cache._cache[key];
}

function cleanup() {
    if (Game.time - cache._lastCleanup < 100) return;
    var now = Game.time;
    for (var k in cache._cache) {
        if (now - cache._cache[k].time > 50) delete cache._cache[k];
    }
    cache._lastCleanup = now;
}

module.exports = {
    get: get,
    set: set,
    advance: advance,
    del: del,
    cleanup: cleanup,
};
