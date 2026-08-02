const ROLES = {
    miner:    { allowed: ['mine'] },
    hauler:   { allowed: ['haul', 'sweep'] },
    distributor: { allowed: ['distribute', 'sweep'] },
    fighter:  { allowed: ['defend', 'remoteDefend'] },
    healer:   { allowed: ['heal'] },
    builder:  { allowed: ['build', 'repair', 'upgrade'] },
    upgrader: { allowed: ['upgrade', 'harvest'] },
    harvester:{ allowed: [] }, // unrestricted
    scout:    { allowed: ['scout'] },
    reserver: { allowed: ['reserve'] },
    remoteMiner: { allowed: ['remoteMine'] },
    remoteHauler:{ allowed: ['remoteHaul', 'haul'] },
    remoteBuilder:{ allowed: ['remoteBuild'] },
    claimer:  { allowed: ['claim'] },
    bootstrapper:{ allowed: ['bootstrap'] },
};

function isAllowed(role, taskType) {
    const cfg = ROLES[role];
    if (!cfg) return true;
    if (cfg.allowed.length === 0) return true;
    return cfg.allowed.indexOf(taskType) !== -1;
}

const _allowedSetCache = {};
// ROLES is a module-level constant, so the built set per role never changes
// at runtime. Cache it permanently (no tick reset) to avoid rebuilding the
// { [taskType]: true } object on every call. Used by creepRunner.filterByRole
// for combat creeps.
function allowedSet(role) {
    if (_allowedSetCache[role] !== undefined) return _allowedSetCache[role];
    const cfg = ROLES[role];
    let set;
    if (!cfg || cfg.allowed.length === 0) {
        set = null;
    } else {
        set = {};
        for (let i = 0; i < cfg.allowed.length; i++) {
            set[cfg.allowed[i]] = true;
        }
    }
    _allowedSetCache[role] = set;
    return set;
}

module.exports = {
    ROLES: ROLES,
    isAllowed: isAllowed,
    allowedSet: allowedSet,
};
