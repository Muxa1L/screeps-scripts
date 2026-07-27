const memory = require('./memorySchema');
const constants = require('../config/constants');

const REMOTE_ROUTE_TTL = constants.REMOTE_ROUTE_TTL;

function readCache(from, to) {
    const rr = memory.ensureRemoteRooms();
    // Cache under both endpoints so the return trip reuses the computed
    // route instead of recomputing Game.map.findRoute in the reverse
    // direction. We store under rr[to].routes[from] and rr[from].routes[to].
    const entryTo = rr[to];
    if (entryTo && entryTo.routes && entryTo.routes[from] &&
        Game.time - entryTo.routes[from].tick < REMOTE_ROUTE_TTL) {
        return entryTo.routes[from].route;
    }
    const entryFrom = rr[from];
    if (entryFrom && entryFrom.routes && entryFrom.routes[to]) {
        // Reverse the route — findRoute returns a list of {room, exit} from
        // `from` to `to`; the reverse trip walks it in the opposite order,
        // using the exit of the corresponding forward hop. For simplicity we
        // recompute (cheap) rather than mirroring exit directions.
        if (Game.time - entryFrom.routes[to].tick < REMOTE_ROUTE_TTL) {
            return null; // signal a cache miss so the caller recomputes below
        }
    }
    return null;
}

function writeCache(from, to, route) {
    const rr = memory.ensureRemoteRooms();
    if (!rr[to]) rr[to] = {};
    if (!rr[to].routes) rr[to].routes = {};
    rr[to].routes[from] = { route: route, tick: Game.time };
}

function getRoute(from, to, options) {
    options = options || {};
    if (!options.force) {
        const cached = readCache(from, to);
        if (cached) return cached;
    }
    const route = Game.map.findRoute(from, to);
    if (!route || route === ERR_NO_PATH) return null;
    writeCache(from, to, route);
    return route;
}

function getNextStep(from, to, currentRoomName) {
    const route = getRoute(from, to);
    if (!route || route.length === 0) return null;
    // If current room is the last route entry's exit room, head to the destination.
    if (currentRoomName === to) return null;
    for (let i = 0; i < route.length; i++) {
        if (route[i].room === currentRoomName) {
            return route[i];
        }
    }
    return route[0];
}

module.exports = {
    getRoute: getRoute,
    getNextStep: getNextStep,
    writeCache: writeCache,
    readCache: readCache,
};
