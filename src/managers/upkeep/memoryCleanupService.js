const constants = require('../../config/constants');

const GHOST_GRACE_TICKS = constants.GHOST_GRACE_TICKS;

function runMemoryCleanup() {
    if (!Memory.creeps) return;
    const dead = [];
    for (const cname in Memory.creeps) {
        if (Game.creeps[cname]) continue;
        const mem = Memory.creeps[cname];
        if (!mem._diedAt) mem._diedAt = Game.time;
        // Allow a short grace period before deletion so other systems can read
        // the death tick if needed.
        if (Game.time - mem._diedAt > GHOST_GRACE_TICKS) {
            dead.push(cname);
            delete Memory.creeps[cname];
        }
    }
    if (dead.length === 0 || !Memory.sources) return;
    const deadSet = {};
    for (let i = 0; i < dead.length; i++) deadSet[dead[i]] = true;
    for (const sid in Memory.sources) {
        const slots = Memory.sources[sid].slots;
        if (!slots) continue;
        for (let si = 0; si < slots.length; si++) {
            if (deadSet[slots[si].claimedBy]) slots[si].claimedBy = null;
        }
    }
}

module.exports = {
    runMemoryCleanup: runMemoryCleanup,
};
