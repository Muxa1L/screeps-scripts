const plannerUtils = require('../plannerUtils');

function findContainerPositionNearSource(room, source) {
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const x = source.pos.x + dx;
            const y = source.pos.y + dy;
            if (!plannerUtils.isTileAvailable(room, x, y)) continue;
            return new RoomPosition(x, y, room.name);
        }
    }
    return null;
}

function existingNear(room, pos, range, type) {
    for (let dx = -range; dx <= range; dx++) {
        for (let dy = -range; dy <= range; dy++) {
            const px = pos.x + dx;
            const py = pos.y + dy;
            const p = new RoomPosition(px, py, room.name);
            if (plannerUtils.hasStructureOrSiteAt(p, type)) return true;
        }
    }
    return false;
}

function planContainers(room, _anchor, counts, limits, budget) {
    const target = limits.container || 0;
    if ((counts.container || 0) >= target) return 0;
    const sources = room.find(FIND_SOURCES);
    let placed = 0;
    let placedContainers = counts.container || 0;

    for (let i = 0; i < sources.length && placed < budget; i++) {
        if (placedContainers >= target) break;
        if (existingNear(room, sources[i].pos, 1, STRUCTURE_CONTAINER)) continue;
        const cpos = findContainerPositionNearSource(room, sources[i]);
        if (!cpos) continue;
        const res = room.createConstructionSite(cpos, STRUCTURE_CONTAINER);
        if (res === OK) {
            placedContainers++;
            placed++;
        }
    }

    if (placedContainers < target && placed < budget && room.controller) {
        if (!existingNear(room, room.controller.pos, 2, STRUCTURE_CONTAINER)) {
            const ctrlCpos = plannerUtils.findPositionNear(room, room.controller.pos, 1, 3);
            if (ctrlCpos) {
                const cres = room.createConstructionSite(ctrlCpos, STRUCTURE_CONTAINER);
                if (cres === OK) {
                    placedContainers++;
                    placed++;
                }
            }
        }
    }

    counts.container = placedContainers;
    return placed;
}

module.exports = {
    planContainers: planContainers,
};
