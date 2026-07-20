var STRUCTURE_LIMITS = {
    1: { extension: 0, container: 0, tower: 0 },
    2: { extension: 5, container: 0, tower: 0 },
    3: { extension: 10, container: 5, tower: 0 },
    4: { extension: 20, container: 5, tower: 0 },
    5: { extension: 30, container: 5, tower: 2 },
    6: { extension: 40, container: 5, tower: 2 },
    7: { extension: 50, container: 5, tower: 3 },
    8: { extension: 60, container: 5, tower: 6 },
};

var MAX_SITES_PER_TICK = 3;
var PLANNING_INTERVAL = 100;

function countStructures(room) {
    var counts = {};
    var sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    var structures = room.find(FIND_STRUCTURES);
    for (var i = 0; i < sites.length; i++) {
        var t = sites[i].structureType;
        counts[t] = (counts[t] || 0) + 1;
    }
    for (var j = 0; j < structures.length; j++) {
        var t2 = structures[j].structureType;
        counts[t2] = (counts[t2] || 0) + 1;
    }
    return counts;
}

function isTileAvailable(room, x, y) {
    if (x < 1 || x > 48 || y < 1 || y > 48) return false;
    var pos = new RoomPosition(x, y, room.name);
    var terrain = pos.lookFor(LOOK_TERRAIN);
    if (terrain[0] === 'wall') return false;
    var structures = pos.lookFor(LOOK_STRUCTURES);
    if (structures.length > 0) return false;
    var sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
    if (sites.length > 0) return false;
    return true;
}

function findExtensionPosition(room, anchor) {
    for (var radius = 2; radius <= 6; radius++) {
        for (var dx = -radius; dx <= radius; dx++) {
            for (var dy = -radius; dy <= radius; dy++) {
                if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                var x = anchor.x + dx;
                var y = anchor.y + dy;
                if (!isTileAvailable(room, x, y)) continue;
                return new RoomPosition(x, y, room.name);
            }
        }
    }
    return null;
}

function findContainerPositionNearSource(room, source) {
    for (var dx = -1; dx <= 1; dx++) {
        for (var dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            var x = source.pos.x + dx;
            var y = source.pos.y + dy;
            if (!isTileAvailable(room, x, y)) continue;
            return new RoomPosition(x, y, room.name);
        }
    }
    return null;
}

function findTowerPosition(room, anchor) {
    for (var radius = 3; radius <= 8; radius++) {
        for (var dx = -radius; dx <= radius; dx++) {
            for (var dy = -radius; dy <= radius; dy++) {
                if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                var x = anchor.x + dx;
                var y = anchor.y + dy;
                if (!isTileAvailable(room, x, y)) continue;
                return new RoomPosition(x, y, room.name);
            }
        }
    }
    return null;
}

function planRoom(room) {
    var limits = STRUCTURE_LIMITS[room.controller.level];
    if (!limits) return;

    var counts = countStructures(room);
    var spawns = room.find(FIND_MY_SPAWNS);
    if (spawns.length === 0) return;
    var anchor = spawns[0].pos;
    var placed = 0;

    var extensionTarget = limits.extension || 0;
    var extensionCurrent = counts.extension || 0;
    while (extensionCurrent < extensionTarget && placed < MAX_SITES_PER_TICK) {
        var pos = findExtensionPosition(room, anchor);
        if (!pos) break;
        var res = room.createConstructionSite(pos, STRUCTURE_EXTENSION);
        if (res === OK) {
            extensionCurrent++;
            placed++;
        } else {
            break;
        }
    }

    var containerTarget = limits.container || 0;
    var containerCurrent = counts.container || 0;
    if (containerCurrent < containerTarget && placed < MAX_SITES_PER_TICK) {
        var sources = room.find(FIND_SOURCES);
        var placedContainers = 0;
        for (var i = 0; i < sources.length && placed < MAX_SITES_PER_TICK; i++) {
            if (placedContainers >= containerTarget) break;
            var existingNearSource = false;
            for (var dx = -1; dx <= 1 && !existingNearSource; dx++) {
                for (var dy = -1; dy <= 1 && !existingNearSource; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    var px = sources[i].pos.x + dx;
                    var py = sources[i].pos.y + dy;
                    var look = new RoomPosition(px, py, room.name).lookFor(LOOK_STRUCTURES);
                    for (var s = 0; s < look.length; s++) {
                        if (look[s].structureType === STRUCTURE_CONTAINER) {
                            existingNearSource = true;
                            break;
                        }
                    }
                }
            }
            if (existingNearSource) continue;
            var cpos = findContainerPositionNearSource(room, sources[i]);
            if (!cpos) continue;
            var res2 = room.createConstructionSite(cpos, STRUCTURE_CONTAINER);
            if (res2 === OK) {
                placedContainers++;
                placed++;
            }
        }
    }

    var towerTarget = limits.tower || 0;
    var towerCurrent = counts.tower || 0;
    while (towerCurrent < towerTarget && placed < MAX_SITES_PER_TICK) {
        var tpos = findTowerPosition(room, anchor);
        if (!tpos) break;
        var res3 = room.createConstructionSite(tpos, STRUCTURE_TOWER);
        if (res3 === OK) {
            towerCurrent++;
            placed++;
        } else {
            break;
        }
    }
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