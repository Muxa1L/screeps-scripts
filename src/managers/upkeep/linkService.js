const roomManager = require('../roomManager');
const constants = require('../../config/constants');

const LINK_LOSS_RATIO = constants.LINK_LOSS_RATIO;

// A link is a "source link" if it sits within range 3 of any source. This
// matches linkStrategy's findPositionNear(source.pos, 1, 3) placement. Shared
// with depositService so haulers only deposit into source links (not the
// controller/storage links, which are filled by the link-to-link transfer).
function isSourceLink(link, sources) {
    if (!link || !link.pos || !sources) return false;
    for (let i = 0; i < sources.length; i++) {
        if (link.pos.inRangeTo(sources[i].pos, 3)) return true;
    }
    return false;
}

function runLink(link) {
    const room = link.room;
    if (!room) return;
    const snap = roomManager.get(room.name);

    const sources = snap ? snap.sources : room.find(FIND_SOURCES);
    if (!isSourceLink(link, sources)) return;

    // Transfer threshold: keep low enough that the controller link stays
    // topped up even when source links fill slowly. The previous 50-energy
    // threshold let a 49-energy source link sit idle while the controller
    // link starved with storage full. 10 is the minimum that still avoids
    // single-energy noise transfers.
    if (link.store[RESOURCE_ENERGY] < 10) return;
    if (link.cooldown > 0) return;

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
        if (room.controller && room.controller.my && allLinks[j].pos.inRangeTo(room.controller.pos, 4)) {
            controllerLink = allLinks[j];
        }
    }

    let target = null;
    if (controllerLink &&
        controllerLink.store[RESOURCE_ENERGY] < controllerLink.store.getCapacity(RESOURCE_ENERGY) - 10) {
        target = controllerLink;
    } else if (storageLink &&
               storageLink.store[RESOURCE_ENERGY] < storageLink.store.getCapacity(RESOURCE_ENERGY) - 10) {
        target = storageLink;
    }
    if (!target) return;

    // Account for the 3% link transfer loss: transferring `amount` delivers
    // floor(amount * (1 - LINK_LOSS_RATIO)) to the target. Send just enough
    // to fill the target after loss, capped by source energy, so we don't
    // over-transfer and waste energy the source could keep for next tick.
    const targetFree = target.store.getCapacity(RESOURCE_ENERGY) - (target.store[RESOURCE_ENERGY] || 0);
    const sourceEnergy = link.store[RESOURCE_ENERGY] || 0;
    // transferEnergy fails with ERR_FULL if amount > targetFree (Screeps
    // checks the raw amount, not the delivered amount after loss) and
    // ERR_NOT_ENOUGH_RESOURCES if amount > sourceEnergy. So cap by both.
    const amount = Math.min(sourceEnergy, targetFree);
    if (amount > 0) link.transferEnergy(target, amount);
}

module.exports = {
    runLink: runLink,
    isSourceLink: isSourceLink,
};
