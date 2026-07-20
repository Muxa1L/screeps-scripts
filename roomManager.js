var snapshots = {};
var lastTick = -1;

var DEFEND_RANGE_FOR = 5;

function snapshotFor(room) {
    var hostiles = room.find(FIND_HOSTILE_CREEPS);
    var damagedFriendlies = room.find(FIND_MY_CREEPS, {
        filter: function (c) { return c.hits < c.hitsMax; },
    });
    var constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
    var droppedEnergy = room.find(FIND_DROPPED_RESOURCES, {
        filter: function (r) { return r.amount > 10; },
    });
    var tombstones = room.find(FIND_TOMBSTONES, {
        filter: function (t) { return _.sum(t.store) > 10; },
    });
    var ruins = room.find(FIND_RUINS, {
        filter: function (r) { return _.sum(r.store) > 10; },
    });
    var damagedCritical = room.find(FIND_STRUCTURES, {
        filter: function (s) {
            if (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) {
                return s.hits < 10000;
            }
            return false;
        },
    });
    var damagedNonCritical = room.find(FIND_STRUCTURES, {
        filter: function (s) {
            if (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) return false;
            if (s.hits >= s.hitsMax) return false;
            return s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_ROAD;
        },
    });
    var sources = room.find(FIND_SOURCES_ACTIVE);
    var energyStructures = room.find(FIND_STRUCTURES, {
        filter: function (s) {
            return (s.structureType === STRUCTURE_EXTENSION ||
                    s.structureType === STRUCTURE_SPAWN ||
                    s.structureType === STRUCTURE_TOWER) &&
                   s.energy < s.energyCapacity;
        },
    });
    var containers = room.find(FIND_STRUCTURES, {
        filter: function (s) { return s.structureType === STRUCTURE_CONTAINER; },
    });

    var controller = room.controller;
    var controllerState = null;
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
        controller: controllerState,
    };
}

function tick() {
    if (Game.time === lastTick) return;
    lastTick = Game.time;
    snapshots = {};
    for (var name in Game.rooms) {
        var room = Game.rooms[name];
        if (!room.controller || !room.controller.my) continue;
        snapshots[name] = snapshotFor(room);
    }
}

function get(roomName) {
    return snapshots[roomName] || null;
}

module.exports = {
    tick: tick,
    get: get,
};
