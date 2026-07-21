const constants = require('../config/constants');
const plannerUtils = require('./plannerUtils');
const roadStrategy = require('./strategies/roadStrategy');
const extensionStrategy = require('./strategies/extensionStrategy');
const containerStrategy = require('./strategies/containerStrategy');
const storageStrategy = require('./strategies/storageStrategy');
const linkStrategy = require('./strategies/linkStrategy');
const towerStrategy = require('./strategies/towerStrategy');

const STRUCTURE_LIMITS = {
    1: { extension: 0, container: 0, tower: 0, storage: 0, link: 0 },
    2: { extension: 5, container: 0, tower: 0, storage: 0, link: 0 },
    3: { extension: 10, container: 5, tower: 0, storage: 0, link: 0 },
    4: { extension: 20, container: 5, tower: 0, storage: 1, link: 0 },
    5: { extension: 30, container: 5, tower: 2, storage: 1, link: 2 },
    6: { extension: 40, container: 5, tower: 2, storage: 1, link: 3 },
    7: { extension: 50, container: 5, tower: 3, storage: 1, link: 4 },
    8: { extension: 60, container: 5, tower: 6, storage: 1, link: 6 },
};

const MAX_SITES_PER_TICK = constants.MAX_SITES_PER_TICK;
const PLANNING_INTERVAL = constants.PLANNING_INTERVAL;

function planRoom(room) {
    const limits = STRUCTURE_LIMITS[room.controller.level];
    if (!limits) return;

    const counts = plannerUtils.countStructures(room);
    const spawns = room.find(FIND_MY_SPAWNS);
    if (spawns.length === 0) return;
    const anchor = spawns[0].pos;
    let used = 0;

    if (!Memory.flags || !Memory.flags.disableRoads) {
        used += roadStrategy.planRoads(room, MAX_SITES_PER_TICK - used);
    }

    used += extensionStrategy.planExtensions(room, anchor, counts, limits, MAX_SITES_PER_TICK - used);
    used += containerStrategy.planContainers(room, anchor, counts, limits, MAX_SITES_PER_TICK - used);
    used += storageStrategy.planStorage(room, anchor, counts, limits, MAX_SITES_PER_TICK - used);
    used += linkStrategy.planLinks(room, anchor, counts, limits, MAX_SITES_PER_TICK - used);
    used += towerStrategy.planTowers(room, anchor, counts, limits, MAX_SITES_PER_TICK - used);
    return used;
}

function tick(room) {
    if (Game.time % PLANNING_INTERVAL !== 0) return;
    if (!room.controller || !room.controller.my) return;
    planRoom(room);
}

module.exports = {
    tick: tick,
    planRoom: planRoom,
    STRUCTURE_LIMITS: STRUCTURE_LIMITS,
};
