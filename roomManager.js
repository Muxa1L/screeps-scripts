let snapshots = {};
let lastTick = -1;

function snapshotFor(room) {
    const hostiles = room.find(FIND_HOSTILE_CREEPS);
    const damagedFriendlies = room.find(FIND_MY_CREEPS, {
        filter: function (c) { return c.hits < c.hitsMax; },
    });
    const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
    const droppedEnergy = room.find(FIND_DROPPED_RESOURCES, {
        filter: function (r) { return r.amount > 10; },
    });
    const tombstones = room.find(FIND_TOMBSTONES, {
        filter: function (t) { return _.sum(t.store) > 10; },
    });
    const ruins = room.find(FIND_RUINS, {
        filter: function (r) { return _.sum(r.store) > 10; },
    });
    const damagedCritical = [];
    const damagedNonCritical = [];
    const allStructures = room.find(FIND_STRUCTURES);
    for (let i = 0; i < allStructures.length; i++) {
        const s = allStructures[i];
        if (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) {
            if (s.hits < 10000) damagedCritical.push(s);
        } else if (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_ROAD) {
            if (s.hits < s.hitsMax) damagedNonCritical.push(s);
        }
    }
    const sources = room.find(FIND_SOURCES);
    const energyStructures = room.find(FIND_STRUCTURES, {
        filter: function (s) {
            return (s.structureType === STRUCTURE_EXTENSION ||
                    s.structureType === STRUCTURE_SPAWN ||
                    s.structureType === STRUCTURE_TOWER) &&
                   s.energy < s.energyCapacity;
        },
    });
    const containers = room.find(FIND_STRUCTURES, {
        filter: function (s) { return s.structureType === STRUCTURE_CONTAINER; },
    });
    const links = room.find(FIND_STRUCTURES, {
        filter: function (s) { return s.structureType === STRUCTURE_LINK; },
    });

    const controller = room.controller;
    let controllerState = null;
    if (controller) {
        controllerState = {
            level: controller.level,
            progress: controller.progress,
            progressTotal: controller.progressTotal,
            ticksToDowngrade: controller.ticksToDowngrade,
            upgradeBlocked: controller.upgradeBlocked || 0,
            safeModeAvailable: controller.safeModeAvailable || 0,
            safeModeActive: controller.safeMode || 0,
        };
    }

    return {
        roomName: room.name,
        hostiles: hostiles,
        hostilePositions: hostiles.map(function (h) { return h.pos; }),
        damagedFriendlies: damagedFriendlies,
        constructionSites: constructionSites,
        droppedEnergy: droppedEnergy,
        tombstones: tombstones,
        ruins: ruins,
        damagedCritical: damagedCritical,
        damagedNonCritical: damagedNonCritical,
        sources: sources,
        energyStructures: energyStructures,
        containers: containers,
        links: links,
        storage: room.storage || null,
        controller: controllerState,
    };
}

function tick() {
    if (Game.time === lastTick) return;
    lastTick = Game.time;
    snapshots = {};
    for (const name in Game.rooms) {
        const room = Game.rooms[name];
        if (!room.controller || !room.controller.my) continue;
        snapshots[name] = snapshotFor(room);
    }
}

function get(roomName) {
    return snapshots[roomName] || null;
}

function isPosNearHostile(roomName, pos, range) {
    range = range || 5;
    const snap = snapshots[roomName];
    if (!snap || !snap.hostilePositions) return false;
    for (let i = 0; i < snap.hostilePositions.length; i++) {
        const hp = snap.hostilePositions[i];
        if (hp.roomName !== pos.roomName) continue;
        if (Math.abs(hp.x - pos.x) <= range && Math.abs(hp.y - pos.y) <= range) return true;
    }
    return false;
}

module.exports = {
    tick: tick,
    get: get,
    isPosNearHostile: isPosNearHostile,
};
