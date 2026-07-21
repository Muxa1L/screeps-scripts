const plannerUtils = require('../plannerUtils');

function findTowerPosition(room, anchor) {
    for (let radius = 3; radius <= 8; radius++) {
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

function planTowers(room, anchor, counts, limits, budget) {
    const target = limits.tower || 0;
    let current = counts.tower || 0;
    let placed = 0;
    while (current < target && placed < budget) {
        const tpos = findTowerPosition(room, anchor);
        if (!tpos) break;
        const res = room.createConstructionSite(tpos, STRUCTURE_TOWER);
        if (res === OK) {
            current++;
            placed++;
        } else {
            break;
        }
    }
    counts.tower = current;
    return placed;
}

module.exports = {
    planTowers: planTowers,
};
