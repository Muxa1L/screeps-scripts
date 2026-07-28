const constants = require('../config/constants');

const rampartTargetFor = constants.rampartTargetFor;

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
    const energyStructures = [];
    const containers = [];
    const links = [];
    const repairTargets = [];
    // Single FIND_STRUCTURES scan; categorize every structure in one pass to
    // avoid re-running the (expensive) find for energy structures, containers,
    // and links. `repairTargets` is the pre-filtered list the tower consults
    // so each tower doesn't have to re-scan + re-filter every tick.
    const rcl = room.controller ? room.controller.level : 0;
    const rampartTarget = rampartTargetFor(rcl);
    const allStructures = room.find(FIND_STRUCTURES);
    for (let i = 0; i < allStructures.length; i++) {
        const s = allStructures[i];
        const st = s.structureType;
        if (st === STRUCTURE_RAMPART || st === STRUCTURE_WALL) {
            // Critical threshold scales with RCL so a 50k-hits rampart at RCL 8
            // (whose target is 1M) is triaged ahead of a freshly-built 9k one
            // at RCL 3. Floor at 10000 so thin low-RCL ramparts still jump the
            // queue, and cap at rampartTarget/2 so a half-target rampart is
            // always considered critical regardless of RCL.
            const critThreshold = Math.min(10000, Math.floor(rampartTarget / 2));
            if (s.hits < critThreshold) damagedCritical.push(s);
            else if (s.hits < s.hitsMax) damagedNonCritical.push(s);
            if (s.hits < rampartTarget) repairTargets.push(s);
        } else if (st === STRUCTURE_CONTAINER) {
            containers.push(s);
            if (s.hits < s.hitsMax) {
                damagedNonCritical.push(s);
                repairTargets.push(s);
            }
        } else if (st === STRUCTURE_ROAD) {
            if (s.hits < s.hitsMax) {
                damagedNonCritical.push(s);
                repairTargets.push(s);
            }
        } else if (st === STRUCTURE_EXTENSION || st === STRUCTURE_SPAWN || st === STRUCTURE_TOWER) {
            if (s.energy < s.energyCapacity) energyStructures.push(s);
            if (s.hits < s.hitsMax) repairTargets.push(s);
        } else if (st === STRUCTURE_LINK) {
            links.push(s);
            if (s.hits < s.hitsMax) repairTargets.push(s);
        }
    }
    const sources = room.find(FIND_SOURCES);
    const hostileStructures = room.find(FIND_HOSTILE_STRUCTURES);

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
        hostileStructures: hostileStructures,
        damagedFriendlies: damagedFriendlies,
        constructionSites: constructionSites,
        droppedEnergy: droppedEnergy,
        tombstones: tombstones,
        ruins: ruins,
        damagedCritical: damagedCritical,
        damagedNonCritical: damagedNonCritical,
        repairTargets: repairTargets,
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
        // Snapshot every visible room so combat tasks (defend/heal) are generated
        // even in unowned/remote rooms. Economy fields will simply be empty there.
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
