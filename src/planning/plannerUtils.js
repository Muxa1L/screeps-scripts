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

// Structures that block new construction on a tile. Roads, containers,
// and ramparts can coexist with most other structures — they should NOT
// prevent placement of extensions, storage, towers, links, etc.
var BLOCKING_TYPES = {
    'spawn': true,
    'extension': true,
    'tower': true,
    'storage': true,
    'link': true,
    'lab': true,
    'terminal': true,
    'nuker': true,
    'powerSpawn': true,
    'observer': true,
    'extractor': true,
    'factory': true,
    'constructedWall': true,
};

function isTileAvailable(room, x, y) {
    if (x < 1 || x > 48 || y < 1 || y > 48) return false;
    var pos = new RoomPosition(x, y, room.name);
    var terrain = pos.lookFor(LOOK_TERRAIN);
    if (terrain[0] === 'wall') return false;
    var structures = pos.lookFor(LOOK_STRUCTURES);
    for (var i = 0; i < structures.length; i++) {
        if (BLOCKING_TYPES[structures[i].structureType]) return false;
    }
    var sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
    for (var j = 0; j < sites.length; j++) {
        if (BLOCKING_TYPES[sites[j].structureType]) return false;
    }
    return true;
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

module.exports = {
    countStructures: countStructures,
    hasStructureOrSiteAt: hasStructureOrSiteAt,
    isTileAvailable: isTileAvailable,
    findPositionNear: findPositionNear,
};
