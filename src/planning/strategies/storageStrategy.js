const plannerUtils = require('../plannerUtils');

function findStoragePosition(room, anchor) {
    for (let radius = 2; radius <= 5; radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                const x = anchor.x + dx;
                const y = anchor.y + dy;
                if (!plannerUtils.isTileAvailable(room, x, y)) continue;
                return new RoomPosition(x, y, room.name);
            }
        }
    }
    return null;
}

function planStorage(room, anchor, counts, limits, budget) {
    const target = limits.storage || 0;
    let current = counts.storage || 0;
    let placed = 0;
    while (current < target && placed < budget) {
        const spos = findStoragePosition(room, anchor);
        if (!spos) break;
        const res = room.createConstructionSite(spos, STRUCTURE_STORAGE);
        if (res === OK) {
            current++;
            placed++;
        } else {
            break;
        }
    }
    counts.storage = current;
    return placed;
}

module.exports = {
    planStorage: planStorage,
};
