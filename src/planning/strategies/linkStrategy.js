const plannerUtils = require('../plannerUtils');

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

function planLinks(room, _anchor, counts, limits, budget) {
    const target = limits.link || 0;
    if ((counts.link || 0) >= target) return 0;
    let placed = 0;
    let placedLinks = counts.link || 0;

    // Priority 1: storage link — without it, source links have nowhere to
    // send energy and the link network is useless.
    if (placedLinks < target && placed < budget && room.storage) {
        if (!existingNear(room, room.storage.pos, 3, STRUCTURE_LINK)) {
            const storLinkPos = plannerUtils.findPositionNear(room, room.storage.pos, 1, 3);
            if (storLinkPos) {
                const sres = room.createConstructionSite(storLinkPos, STRUCTURE_LINK);
                if (sres === OK) {
                    placedLinks++;
                    placed++;
                }
            }
        }
    }

    // Priority 2: source links — prefer the FARTHEST source first, so the
    // link network covers the longest haul distance. The nearest source can
    // be serviced by haulers walking a short distance.
    const linkSources = room.find(FIND_SOURCES);
    // Sort by distance from spawn (descending = farthest first).
    const spawns = room.find(FIND_MY_SPAWNS);
    const anchor = spawns.length > 0 ? spawns[0].pos : room.controller ? room.controller.pos : { x: 25, y: 25, roomName: room.name };
    linkSources.sort(function (a, b) {
        return b.pos.getRangeTo(anchor) - a.pos.getRangeTo(anchor);
    });
    for (let si = 0; si < linkSources.length && placed < budget; si++) {
        if (placedLinks >= target) break;
        if (existingNear(room, linkSources[si].pos, 2, STRUCTURE_LINK)) continue;
        const lpos = plannerUtils.findPositionNear(room, linkSources[si].pos, 1, 3);
        if (!lpos) continue;
        const lres = room.createConstructionSite(lpos, STRUCTURE_LINK);
        if (lres === OK) {
            placedLinks++;
            placed++;
        }
    }

    // Priority 3: controller link.
    if (placedLinks < target && placed < budget && room.controller) {
        if (!existingNear(room, room.controller.pos, 3, STRUCTURE_LINK)) {
            const linkCpos = plannerUtils.findPositionNear(room, room.controller.pos, 1, 4);
            if (linkCpos) {
                const cres = room.createConstructionSite(linkCpos, STRUCTURE_LINK);
                if (cres === OK) {
                    placedLinks++;
                    placed++;
                }
            }
        }
    }

    counts.link = placedLinks;
    return placed;
}

module.exports = {
    planLinks: planLinks,
};
