const plannerUtils = require('../plannerUtils');

function findExtensionPosition(room, anchor) {
    for (let radius = 2; radius <= 6; radius++) {
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

function planExtensions(room, anchor, counts, limits, budget) {
    const target = limits.extension || 0;
    let current = counts.extension || 0;
    let placed = 0;
    while (current < target && placed < budget) {
        const pos = findExtensionPosition(room, anchor);
        if (!pos) break;
        const res = room.createConstructionSite(pos, STRUCTURE_EXTENSION);
        if (res === OK) {
            current++;
            placed++;
        } else {
            break;
        }
    }
    counts.extension = current;
    return placed;
}

module.exports = {
    planExtensions: planExtensions,
};
