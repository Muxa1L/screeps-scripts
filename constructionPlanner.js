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

const MAX_SITES_PER_TICK = 3;
const PLANNING_INTERVAL = 100;

function countStructures(room) {
    const counts = {};
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    const structures = room.find(FIND_STRUCTURES);
    for (let i = 0; i < sites.length; i++) {
        const t = sites[i].structureType;
        counts[t] = (counts[t] || 0) + 1;
    }
    for (let j = 0; j < structures.length; j++) {
        const t2 = structures[j].structureType;
        counts[t2] = (counts[t2] || 0) + 1;
    }
    return counts;
}

function hasStructureOrSiteAt(pos, type) {
    const structures = pos.lookFor(LOOK_STRUCTURES);
    for (let i = 0; i < structures.length; i++) {
        if (structures[i].structureType === type) return true;
    }
    const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
    for (let j = 0; j < sites.length; j++) {
        if (sites[j].structureType === type) return true;
    }
    return false;
}

function isTileAvailable(room, x, y) {
    if (x < 1 || x > 48 || y < 1 || y > 48) return false;
    const pos = new RoomPosition(x, y, room.name);
    const terrain = pos.lookFor(LOOK_TERRAIN);
    if (terrain[0] === 'wall') return false;
    const structures = pos.lookFor(LOOK_STRUCTURES);
    if (structures.length > 0) return false;
    const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
    if (sites.length > 0) return false;
    return true;
}

function findExtensionPosition(room, anchor) {
    for (let radius = 2; radius <= 6; radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                const x = anchor.x + dx;
                const y = anchor.y + dy;
                if (!isTileAvailable(room, x, y)) continue;
                return new RoomPosition(x, y, room.name);
            }
        }
    }
    return null;
}

function findContainerPositionNearSource(room, source) {
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const x = source.pos.x + dx;
            const y = source.pos.y + dy;
            if (!isTileAvailable(room, x, y)) continue;
            return new RoomPosition(x, y, room.name);
        }
    }
    return null;
}

function findTowerPosition(room, anchor) {
    for (let radius = 3; radius <= 8; radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                const x = anchor.x + dx;
                const y = anchor.y + dy;
                if (!isTileAvailable(room, x, y)) continue;
                return new RoomPosition(x, y, room.name);
            }
        }
    }
    return null;
}

function findStoragePosition(room, anchor) {
    for (let radius = 2; radius <= 5; radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                const x = anchor.x + dx;
                const y = anchor.y + dy;
                if (!isTileAvailable(room, x, y)) continue;
                return new RoomPosition(x, y, room.name);
            }
        }
    }
    return null;
}

function findPositionNear(room, target, minRadius, maxRadius) {
    for (let radius = minRadius; radius <= maxRadius; radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                const x = target.x + dx;
                const y = target.y + dy;
                if (!isTileAvailable(room, x, y)) continue;
                return new RoomPosition(x, y, room.name);
            }
        }
    }
    return null;
}

function hasRoadAt(pos) {
    const structures = pos.lookFor(LOOK_STRUCTURES);
    for (let i = 0; i < structures.length; i++) {
        if (structures[i].structureType === STRUCTURE_ROAD) return true;
    }
    const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
    for (let j = 0; j < sites.length; j++) {
        if (sites[j].structureType === STRUCTURE_ROAD) return true;
    }
    return false;
}

function addRoad(room, from, to, planned) {
    const path = room.findPath(from, to, {
        ignoreCreeps: true,
        ignoreDestructibleStructures: false,
        maxOps: 500,
    });
    for (let i = 0; i < path.length; i++) {
        const step = path[i];
        const key = step.x + ',' + step.y;
        if (planned[key]) continue;
        planned[key] = true;
        const pos = new RoomPosition(step.x, step.y, room.name);
        const terrain = pos.lookFor(LOOK_TERRAIN);
        if (terrain[0] === 'wall') continue;
        const structures = pos.lookFor(LOOK_STRUCTURES);
        if (structures.length > 0) continue;
        if (hasRoadAt(pos)) continue;
        return pos;
    }
    return null;
}

function planRoads(room, budget) {
    if (typeof budget !== 'number' || budget <= 0) return 0;
    const spawns = room.find(FIND_MY_SPAWNS);
    if (spawns.length === 0) return 0;
    const anchor = spawns[0].pos;
    const sources = room.find(FIND_SOURCES);
    const controller = room.controller;
    const storage = room.storage;

    const planned = {};
    let placed = 0;
    const maxRoads = Math.min(10, budget);

    for (let i = 0; i < sources.length && placed < maxRoads; i++) {
        const pos = addRoad(room, anchor, sources[i].pos, planned);
        if (pos) {
            const res = room.createConstructionSite(pos, STRUCTURE_ROAD);
            if (res === OK) placed++;
        }
    }
    if (controller && placed < maxRoads) {
        const pos = addRoad(room, anchor, controller.pos, planned);
        if (pos) {
            const res = room.createConstructionSite(pos, STRUCTURE_ROAD);
            if (res === OK) placed++;
        }
    }
    if (storage && placed < maxRoads) {
        const pos = addRoad(room, anchor, storage.pos, planned);
        if (pos) {
            const res = room.createConstructionSite(pos, STRUCTURE_ROAD);
            if (res === OK) placed++;
        }
    }
    return placed;
}

function planRoom(room) {
    const limits = STRUCTURE_LIMITS[room.controller.level];
    if (!limits) return;

    const counts = countStructures(room);
    const spawns = room.find(FIND_MY_SPAWNS);
    if (spawns.length === 0) return;
    const anchor = spawns[0].pos;
    let placed = 0;

    if (!Memory.flags || !Memory.flags.disableRoads) {
        placed += planRoads(room, MAX_SITES_PER_TICK - placed);
    }

    const extensionTarget = limits.extension || 0;
    let extensionCurrent = counts.extension || 0;
    while (extensionCurrent < extensionTarget && placed < MAX_SITES_PER_TICK) {
        const pos = findExtensionPosition(room, anchor);
        if (!pos) break;
        const res = room.createConstructionSite(pos, STRUCTURE_EXTENSION);
        if (res === OK) {
            extensionCurrent++;
            placed++;
        } else {
            break;
        }
    }

    const containerTarget = limits.container || 0;
    const containerCurrent = counts.container || 0;
    if (containerCurrent < containerTarget && placed < MAX_SITES_PER_TICK) {
        const sources = room.find(FIND_SOURCES);
        let placedContainers = 0;
        for (let i = 0; i < sources.length && placed < MAX_SITES_PER_TICK; i++) {
            if (placedContainers >= containerTarget) break;
            let existingNearSource = false;
            for (let dx = -1; dx <= 1 && !existingNearSource; dx++) {
                for (let dy = -1; dy <= 1 && !existingNearSource; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    const px = sources[i].pos.x + dx;
                    const py = sources[i].pos.y + dy;
                    const pos = new RoomPosition(px, py, room.name);
                    if (hasStructureOrSiteAt(pos, STRUCTURE_CONTAINER)) {
                        existingNearSource = true;
                        break;
                    }
                }
            }
            if (existingNearSource) continue;
            const cpos = findContainerPositionNearSource(room, sources[i]);
            if (!cpos) continue;
            const res2 = room.createConstructionSite(cpos, STRUCTURE_CONTAINER);
            if (res2 === OK) {
                placedContainers++;
                placed++;
            }
        }
        if (placedContainers < containerTarget && placed < MAX_SITES_PER_TICK && room.controller) {
            let existingNearController = false;
            for (let cdx = -2; cdx <= 2 && !existingNearController; cdx++) {
                for (let cdy = -2; cdy <= 2 && !existingNearController; cdy++) {
                    const cpx = room.controller.pos.x + cdx;
                    const cpy = room.controller.pos.y + cdy;
                    const cpos = new RoomPosition(cpx, cpy, room.name);
                    if (hasStructureOrSiteAt(cpos, STRUCTURE_CONTAINER)) {
                        existingNearController = true;
                        break;
                    }
                }
            }
            if (!existingNearController) {
                const ctrlCpos = findPositionNear(room, room.controller.pos, 1, 3);
                if (ctrlCpos) {
                    const cres = room.createConstructionSite(ctrlCpos, STRUCTURE_CONTAINER);
                    if (cres === OK) {
                        placedContainers++;
                        placed++;
                    }
                }
            }
        }
    }

    const storageTarget = limits.storage || 0;
    let storageCurrent = counts.storage || 0;
    while (storageCurrent < storageTarget && placed < MAX_SITES_PER_TICK) {
        const spos = findStoragePosition(room, anchor);
        if (!spos) break;
        const res4 = room.createConstructionSite(spos, STRUCTURE_STORAGE);
        if (res4 === OK) {
            storageCurrent++;
            placed++;
        } else {
            break;
        }
    }

    const linkTarget = limits.link || 0;
    const linkCurrent = counts.link || 0;
    if (linkCurrent < linkTarget && placed < MAX_SITES_PER_TICK) {
        const linkSources = room.find(FIND_SOURCES);
        let placedLinks = 0;
        for (let si = 0; si < linkSources.length && placed < MAX_SITES_PER_TICK; si++) {
            if (placedLinks >= linkTarget) break;
            let existingLinkNearSource = false;
            for (let ldx = -2; ldx <= 2 && !existingLinkNearSource; ldx++) {
                for (let ldy = -2; ldy <= 2 && !existingLinkNearSource; ldy++) {
                    const lpx = linkSources[si].pos.x + ldx;
                    const lpy = linkSources[si].pos.y + ldy;
                    const lpos = new RoomPosition(lpx, lpy, room.name);
                    if (hasStructureOrSiteAt(lpos, STRUCTURE_LINK)) {
                        existingLinkNearSource = true;
                        break;
                    }
                }
            }
            if (existingLinkNearSource) continue;
            const lpos = findPositionNear(room, linkSources[si].pos, 1, 3);
            if (!lpos) continue;
            const lres = room.createConstructionSite(lpos, STRUCTURE_LINK);
            if (lres === OK) {
                placedLinks++;
                placed++;
            }
        }
        if (placedLinks < linkTarget && placed < MAX_SITES_PER_TICK && room.controller) {
            let existingLinkNearController = false;
            for (let cdx = -3; cdx <= 3 && !existingLinkNearController; cdx++) {
                for (let cdy = -3; cdy <= 3 && !existingLinkNearController; cdy++) {
                    const cpx = room.controller.pos.x + cdx;
                    const cpy = room.controller.pos.y + cdy;
                    const cpos = new RoomPosition(cpx, cpy, room.name);
                    if (hasStructureOrSiteAt(cpos, STRUCTURE_LINK)) {
                        existingLinkNearController = true;
                        break;
                    }
                }
            }
            if (!existingLinkNearController) {
                const linkCpos = findPositionNear(room, room.controller.pos, 1, 4);
                if (linkCpos) {
                    const cres = room.createConstructionSite(linkCpos, STRUCTURE_LINK);
                    if (cres === OK) {
                        placedLinks++;
                        placed++;
                    }
                }
            }
        }
        if (placedLinks < linkTarget && placed < MAX_SITES_PER_TICK && room.storage) {
            let existingLinkNearStorage = false;
            for (let sdx = -3; sdx <= 3 && !existingLinkNearStorage; sdx++) {
                for (let sdy = -3; sdy <= 3 && !existingLinkNearStorage; sdy++) {
                    const spx = room.storage.pos.x + sdx;
                    const spy = room.storage.pos.y + sdy;
                    const spos = new RoomPosition(spx, spy, room.name);
                    if (hasStructureOrSiteAt(spos, STRUCTURE_LINK)) {
                        existingLinkNearStorage = true;
                        break;
                    }
                }
            }
            if (!existingLinkNearStorage) {
                const storLinkPos = findPositionNear(room, room.storage.pos, 1, 3);
                if (storLinkPos) {
                    const sres = room.createConstructionSite(storLinkPos, STRUCTURE_LINK);
                    if (sres === OK) {
                        placedLinks++;
                        placed++;
                    }
                }
            }
        }
    }

    const towerTarget = limits.tower || 0;
    let towerCurrent = counts.tower || 0;
    while (towerCurrent < towerTarget && placed < MAX_SITES_PER_TICK) {
        const tpos = findTowerPosition(room, anchor);
        if (!tpos) break;
        const res3 = room.createConstructionSite(tpos, STRUCTURE_TOWER);
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