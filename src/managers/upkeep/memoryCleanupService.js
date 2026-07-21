function runMemoryCleanup() {
    if (!Memory.creeps) return;
    const dead = [];
    for (const cname in Memory.creeps) {
        if (Game.creeps[cname]) continue;
        dead.push(cname);
        delete Memory.creeps[cname];
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
