const plannerUtils = require('../plannerUtils');

// v1: structure blanket — place a rampart on every tile occupied by a
// critical structure (spawn, extension, tower, storage, link) that doesn't
// already have one. Protects the energy-critical buildings from ranged
// attack. Roads, containers, and walls are intentionally excluded (roads
// under ramparts still work, but blanketing roads is a much larger surface
// and lower priority than protecting the buildings themselves).
const CRITICAL_TYPES = [
    STRUCTURE_SPAWN,
    STRUCTURE_EXTENSION,
    STRUCTURE_TOWER,
    STRUCTURE_STORAGE,
    STRUCTURE_LINK,
];

function planRamparts(room, counts, limits, budget) {
    const target = limits.rampart || 0;
    let current = counts.rampart || 0;
    let placed = 0;
    if (target === 0 || budget <= 0) return 0;

    const structures = room.find(FIND_STRUCTURES);
    for (let i = 0; i < structures.length; i++) {
        if (placed >= budget) break;
        if (current >= target) break;
        const struct = structures[i];
        if (CRITICAL_TYPES.indexOf(struct.structureType) === -1) continue;
        // Skip tiles that already have a rampart (structure or construction site).
        if (plannerUtils.hasStructureOrSiteAt(struct.pos, STRUCTURE_RAMPART)) continue;
        const res = room.createConstructionSite(struct.pos, STRUCTURE_RAMPART);
        if (res === OK) {
            current++;
            placed++;
        } else {
            // Bail on any failure (e.g. invalid tile, site limit) rather than
            // spamming attempts — same pattern as towerStrategy.
            break;
        }
    }
    counts.rampart = current;
    return placed;
}

module.exports = {
    planRamparts: planRamparts,
    CRITICAL_TYPES: CRITICAL_TYPES,
};