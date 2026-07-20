var STRUCTURE_LIMITS = {
    1: { extension: 0, container: 0, tower: 0, storage: 0, link: 0 },
    2: { extension: 5, container: 0, tower: 0, storage: 0, link: 0 },
    3: { extension: 10, container: 5, tower: 0, storage: 0, link: 0 },
    4: { extension: 20, container: 5, tower: 0, storage: 1, link: 0 },
    5: { extension: 30, container: 5, tower: 2, storage: 1, link: 2 },
    6: { extension: 40, container: 5, tower: 2, storage: 1, link: 3 },
    7: { extension: 50, container: 5, tower: 3, storage: 1, link: 4 },
    8: { extension: 60, container: 5, tower: 6, storage: 1, link: 6 },
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

function findStoragePosition(room, anchor) {
    for (var radius = 2; radius <= 5; radius++) {
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

function findPositionNear(room, target, minRadius, maxRadius) {
    for (var radius = minRadius; radius <= maxRadius; radius++) {
        for (var dx = -radius; dx <= radius; dx++) {
            for (var dy = -radius; dy <= radius; dy++) {
                if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                var x = target.x + dx;
                var y = target.y + dy;
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

    var storageTarget = limits.storage || 0;
    var storageCurrent = counts.storage || 0;
    while (storageCurrent < storageTarget && placed < MAX_SITES_PER_TICK) {
        var spos = findStoragePosition(room, anchor);
        if (!spos) break;
        var res4 = room.createConstructionSite(spos, STRUCTURE_STORAGE);
        if (res4 === OK) {
            storageCurrent++;
            placed++;
        } else {
            break;
        }
    }

    var linkTarget = limits.link || 0;
    var linkCurrent = counts.link || 0;
    if (linkCurrent < linkTarget && placed < MAX_SITES_PER_TICK) {
        var linkSources = room.find(FIND_SOURCES);
        var placedLinks = 0;
        for (var si = 0; si < linkSources.length && placed < MAX_SITES_PER_TICK; si++) {
            if (placedLinks >= linkTarget) break;
            var existingLinkNearSource = false;
            for (var ldx = -2; ldx <= 2 && !existingLinkNearSource; ldx++) {
                for (var ldy = -2; ldy <= 2 && !existingLinkNearSource; ldy++) {
                    var lpx = sources[si].pos.x + ldx;
                    var lpy = sources[si].pos.y + ldy;
                    var llook = new RoomPosition(lpx, lpy, room.name).lookFor(LOOK_STRUCTURES);
                    for (var ls = 0; ls < llook.length; ls++) {
                        if (llook[ls].structureType === STRUCTURE_LINK) {
                            existingLinkNearSource = true;
                            break;
                        }
                    }
                }
            }
            if (existingLinkNearSource) continue;
            var lpos = findPositionNear(room, sources[si].pos, 1, 3);
            if (!lpos) continue;
            var lres = room.createConstructionSite(lpos, STRUCTURE_LINK);
            if (lres === OK) {
                placedLinks++;
                placed++;
            }
        }
        if (placedLinks < linkTarget && placed < MAX_SITES_PER_TICK && room.controller) {
            var existingLinkNearController = false;
            for (var cdx = -3; cdx <= 3 && !existingLinkNearController; cdx++) {
                for (var cdy = -3; cdy <= 3 && !existingLinkNearController; cdy++) {
                    var cpx = room.controller.pos.x + cdx;
                    var cpy = room.controller.pos.y + cdy;
                    var clook = new RoomPosition(cpx, cpy, room.name).lookFor(LOOK_STRUCTURES);
                    for (var cs = 0; cs < clook.length; cs++) {
                        if (clook[cs].structureType === STRUCTURE_LINK) {
                            existingLinkNearController = true;
                            break;
                        }
                    }
                }
            }
            if (!existingLinkNearController) {
                var linkCpos = findPositionNear(room, room.controller.pos, 1, 4);
                if (linkCpos) {
                    var cres = room.createConstructionSite(linkCpos, STRUCTURE_LINK);
                    if (cres === OK) {
                        placedLinks++;
                        placed++;
                    }
                }
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