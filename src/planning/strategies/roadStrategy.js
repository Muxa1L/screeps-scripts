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

module.exports = {
    planRoads: planRoads,
};
