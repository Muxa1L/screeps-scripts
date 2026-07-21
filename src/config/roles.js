const ROLES = {
    miner:    { allowed: ['mine'] },
    hauler:   { allowed: ['haul', 'sweep', 'supply'] },
    fighter:  { allowed: ['defend'] },
    healer:   { allowed: ['heal'] },
    builder:  { allowed: ['build', 'repair', 'upgrade'] },
    upgrader: { allowed: ['upgrade', 'harvest'] },
    harvester:{ allowed: [] }, // unrestricted
};

function isAllowed(role, taskType) {
    const cfg = ROLES[role];
    if (!cfg) return true;
    if (cfg.allowed.length === 0) return true;
    return cfg.allowed.indexOf(taskType) !== -1;
}

function allowedSet(role) {
    const cfg = ROLES[role];
    if (!cfg || cfg.allowed.length === 0) return null;
    const set = {};
    for (let i = 0; i < cfg.allowed.length; i++) {
        set[cfg.allowed[i]] = true;
    }
    return set;
}

module.exports = {
    ROLES: ROLES,
    isAllowed: isAllowed,
    allowedSet: allowedSet,
};
