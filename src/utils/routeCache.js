const memory = require('./memorySchema');
const constants = require('../config/constants');

const REMOTE_ROUTE_TTL = constants.REMOTE_ROUTE_TTL;

// Sentinel returned by getNextStep when the creep is already in the
// destination room. Distinct from `null` (which means "no route / blocked")
// so callers can differentiate "stay put" from "give up and re-evaluate."
const ROUTE_DONE = { done: true };

// Opposite exit constants for mirroring a route's reverse direction.
// FIND_EXIT_TOP=1, FIND_EXIT=2, FIND_EXIT_RIGHT=3, FIND_EXIT_BOTTOM=5,
// FIND_EXIT_LEFT=7. FIND_EXIT (any) is its own opposite.
const OPPOSITE_EXIT = {};
OPPOSITE_EXIT[FIND_EXIT_TOP] = FIND_EXIT_BOTTOM;
OPPOSITE_EXIT[FIND_EXIT_BOTTOM] = FIND_EXIT_TOP;
OPPOSITE_EXIT[FIND_EXIT_RIGHT] = FIND_EXIT_LEFT;
OPPOSITE_EXIT[FIND_EXIT_LEFT] = FIND_EXIT_RIGHT;
OPPOSITE_EXIT[FIND_EXIT] = FIND_EXIT;

// Produce the reverse of a standard-format route (from→to becomes to→from).
// `fromRoom` is the original starting room (not present in the route array).
// Standard format: route[i].room = next room, route[i].exit = exit from previous room.
function reverseRoute(route, fromRoom) {
    const out = [];
    for (let i = route.length - 1; i >= 0; i--) {
        const nextRoom = i === 0 ? fromRoom : route[i - 1].room;
        out.push({ room: nextRoom, exit: OPPOSITE_EXIT[route[i].exit] || route[i].exit });
    }
    return out;
}

function readCache(from, to) {
    const rr = memory.ensureRemoteRooms();
    // Cache under both endpoints so the return trip reuses the computed
    // route instead of recomputing Game.map.findRoute in the reverse
    // direction. Forward stored at rr[to].routes[from]; reverse mirror at
    // rr[from].routes[to] (written by writeCache with flipped exits).
    const entryTo = rr[to];
    if (entryTo && entryTo.routes && entryTo.routes[from] &&
        Game.time - entryTo.routes[from].tick < REMOTE_ROUTE_TTL) {
        return entryTo.routes[from].route;
    }
    // Check 2: the reverse mirror (to→from stored at rr[from].routes[to])
    // is a standard-format route for the from→to direction.
    const entryFrom = rr[from];
    if (entryFrom && entryFrom.routes && entryFrom.routes[to] &&
        Game.time - entryFrom.routes[to].tick < REMOTE_ROUTE_TTL) {
        return entryFrom.routes[to].route;
    }
    return null;
}

function writeCache(from, to, route) {
    const rr = memory.ensureRemoteRooms();
    if (!rr[to]) rr[to] = {};
    if (!rr[to].routes) rr[to].routes = {};
    rr[to].routes[from] = { route: route, tick: Game.time };
    // Mirror the reverse direction with flipped exit constants so the return
    // trip hits the cache on the first call instead of recomputing findRoute.
    if (!rr[from]) rr[from] = {};
    if (!rr[from].routes) rr[from].routes = {};
    rr[from].routes[to] = { route: reverseRoute(route, from), tick: Game.time };
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
    if (currentRoomName === to) return ROUTE_DONE;
    // route[i].room is the *next* room (the room you enter), and route[i].exit
    // is the exit from the *previous* room. So to find the step for the creep's
    // current room, we match the previous room in the chain, not route[i].room.
    for (let i = 0; i < route.length; i++) {
        const prevRoom = i === 0 ? from : route[i - 1].room;
        if (prevRoom === currentRoomName) {
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
    ROUTE_DONE: ROUTE_DONE,
};
