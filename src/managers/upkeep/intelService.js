// Intel coordination for upkeep: reads cartographer intel, queues remote
// scans, and writes ownership results back to Memory. Used by the upkeep
// loop to keep Memory.intel fresh without spawning dedicated code.
//
// RCL5 behaviour: the room is fully visible; no scouts needed. The service
// records ownership of the current room and enqueues neighbour rooms for
// future scanning (no-op until RCL6 when a scout creature or terminal-based
// remote observer pipeline is added).

const cartographer = require('../../services/cartographer');

function tick() {
    const home = Memory.config && Memory.config.homeRoom ? Memory.config.homeRoom : 'W47N45';
    // Always keep home ownership fresh.
    const homeObj = Game.rooms[home];
    if (homeObj && homeObj.controller) {
        cartographer.recordOwnership(home);
    }
    // Queue neighbours only once. The cartographer module handles dedup
    // and respects TTL, so we don't have to guard here.
    const neighbours = cartographer.neighbourRooms(home);
    for (let i = 0; i < neighbours.length; i++) {
        cartographer.enqueue(neighbours[i]);
    }
}

function getIntel(roomName) {
    return cartographer.getIntel(roomName);
}

function isFresh(roomName) {
    return cartographer.isFresh(roomName);
}

module.exports = {
    tick: tick,
    getIntel: getIntel,
    isFresh: isFresh,
};
