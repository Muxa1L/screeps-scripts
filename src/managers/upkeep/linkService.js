const roomManager = require('../roomManager');

function runLink(link) {
    const room = link.room;
    if (!room) return;
    const snap = roomManager.get(room.name);

    let isSourceLink = false;
    const sources = snap ? snap.sources : room.find(FIND_SOURCES);
    for (let i = 0; i < sources.length; i++) {
        if (link.pos.inRangeTo(sources[i].pos, 3)) {
            isSourceLink = true;
            break;
        }
    }
    if (!isSourceLink) return;

    if (link.store[RESOURCE_ENERGY] < 50) return;

    let storageLink = null;
    let controllerLink = null;
    const allLinks = snap ? snap.links : room.find(FIND_STRUCTURES, {
        filter: function (s) { return s.structureType === STRUCTURE_LINK; },
    });
    for (let j = 0; j < allLinks.length; j++) {
        if (allLinks[j].id === link.id) continue;
        if (room.storage && allLinks[j].pos.inRangeTo(room.storage.pos, 3)) {
            storageLink = allLinks[j];
        }
        if (room.controller && room.controller.my && allLinks[j].pos.inRangeTo(room.controller.pos, 3)) {
            controllerLink = allLinks[j];
        }
    }

    const target = controllerLink || storageLink;
    if (!target) return;
    if (target.store[RESOURCE_ENERGY] >= target.store.getCapacity(RESOURCE_ENERGY) - 10) return;

    link.transferEnergy(target);
}

module.exports = {
    runLink: runLink,
};
