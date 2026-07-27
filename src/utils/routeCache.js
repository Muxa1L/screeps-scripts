const memory = require('./memorySchema');
const constants = require('../config/constants');

const REMOTE_ROUTE_TTL = constants.REMOTE_ROUTE_TTL;

function getRouteKey(from, to) {
    return from + ':' + to;
}

function getRoute(from, to, options) {
    options = options || {};
    const rr = memory.ensureRemoteRooms();
    const entry = rr[to];
    if (!options.force && entry && entry.route && entry.routeComputedTick &&
        Game.time - entry.routeComputedTick < REMOTE_ROUTE_TTL) {
        return entry.route;
    }
    const route = Game.map.findRoute(from, to);
    if (!route || route === ERR_NO_PATH) return null;
    if (entry) {
        entry.route = route;
        entry.routeComputedTick = Game.time;
    }
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
};
