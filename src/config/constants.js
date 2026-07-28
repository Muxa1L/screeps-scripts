module.exports = {
    // CPU bucket gating
    BUCKET_SPAWN_THRESHOLD: 2000,
    BUCKET_CREEP_THRESHOLD: 1000,
    BUCKET_UPKEEP_THRESHOLD: 500,

    // Renew / recycle / stuck handling
    RENEW_THRESHOLD_SMALL: 100,
    RENEW_THRESHOLD_LARGE: 250,
    PRE_SPAWN_TTL: 100,
    STUCK_THRESHOLD: 200,
    MAX_RECYCLES_PER_TICK: 3,
    TASK_SWITCH_COOLDOWN: 5,
    MOVE_FAIL_THRESHOLD: 5,

    // Safe mode and rampart thresholds
    SAFE_MODE_TRIGGER_RATIO: 0.5,
    SAFE_MODE_TTD_THRESHOLD: 3000,
    SAFE_MODE_COOLDOWN_TICKS: 5000,
    RAMPART_TARGET_HITS: 100000,
    // Rampart/wall target hits, scaled by RCL. Towers repair walls/ramparts
    // up to this hits value; above it they're considered "done". Lower RCLs
    // keep thin ramparts (cheap to maintain); higher RCLs thicken them for
    // defense as towers/storage come online.
    RAMPART_TARGET_HITS_BY_RCL: {
        3: 10000,
        4: 50000,
        5: 100000,
        6: 250000,
        7: 500000,
        8: 1000000,
    },

    // Tower energy minimums
    TOWER_MIN_ATTACK_ENERGY: 250,
    TOWER_MIN_HEAL_ENERGY: 250,
    TOWER_MIN_REPAIR_ENERGY: 500,

    // Controller upgrade urgency
    UPGRADE_EMERGENCY_THRESHOLD: 500,
    UPGRADE_URGENT_THRESHOLD: 1500,
    UPGRADE_CRITICAL_THRESHOLD: 3000,

    // Supply urgency
    SUPPLY_CRITICAL_THRESHOLD: 0.3,
    SUPPLY_LOW_THRESHOLD: 0.6,

    // Energy-source minimums
    STORAGE_WITHDRAW_MIN: 200,
    CONTAINER_WITHDRAW_MIN: 50,
    DROPPED_ENERGY_MIN: 100,
    LINK_WITHDRAW_MIN: 50,
    // Screeps link transfers lose 3% of the sent amount (LINK_LOSS_RATIO).
    // runLink sends ceil(targetFree / (1 - LINK_LOSS_RATIO)) to deliver
    // exactly targetFree after loss, preserving the source's remainder.
    LINK_LOSS_RATIO: 0.03,

    // Construction planning
    MAX_SITES_PER_TICK: 3,
    PLANNING_INTERVAL: 100,

    // Path cache
    PATH_SCORE_TTL: 10,
    PATH_SCORE_CLEANUP_INTERVAL: 50,
    // Upper bound on path-score cache entries. The cache is module-scoped
    // and cleaned up every PATH_SCORE_CLEANUP_INTERVAL ticks, but between
    // cleanups (or after a Game.time jump) it can grow unbounded. Hard-cap
    // it so a long tick gap or a large creep count can't leak memory.
    PATH_SCORE_MAX_ENTRIES: 2000,

    // Logger state
    MAX_PERIODIC_KEYS: 200,

    // Error ring buffer
    MAX_ERRORS: 50,

    // Quota / economy thresholds
    STORAGE_FULL_THRESHOLD: 0.8,
    STORAGE_LOW_THRESHOLD: 0.2,
    CONSTRUCTION_BACKLOG_THRESHOLD: 5000,
    URGENT_TTD: 1000,
    CRITICAL_TTD: 4000,
    WARN_TTD: 6000,

    // Creep-memory cleanup
    GHOST_CRITICAL_AGE: 15,
    GHOST_GRACE_TICKS: 10,

    // Squad coordination
    SQUAD_RETREAT_HP_RATIO: 0.4,
    SQUAD_FORMATION_RANGE: 2,
    SQUAD_TARGET_LATCH_TICKS: 5,
    // Per-squad pairing lock TTL: once a squad claims an unpaired fighter as
    // its new leader, other squads skip that fighter for this many ticks to
    // avoid a last-writer-wins race on findUnpairedFighter.
    SQUAD_PAIRING_LOCK_TICKS: 5,
    DESIRED_SQUADS_BASE: 1,
    DESIRED_SQUADS_RAID: 3,

    // Observer intel
    INTEL_SCAN_INTERVAL: 1,
    INTEL_RAID_DECAY_TICKS: 1000,
    INTEL_RAID_HOSTILE_THRESHOLD: 3,
    INTEL_RAID_NEARBY_DISTANCE: 2,
    INTEL_QUEUE_REFRESH_TICKS: 1000,

    // Remote mining thresholds
    REMOTE_MAX_DISTANCE: 30,
    REMOTE_MIN_STORAGE_RATIO: 0.5,
    REMOTE_MAX_ROOMS: 2,
    REMOTE_THREAT_STALE_TICKS: 5000,
    REMOTE_ABANDON_TICKS: 2000,
    REMOTE_ROUTE_TTL: 1000,
    // Per-state dwell-time guard for remoteManager. A non-terminal status
    // that lingers longer than this reverts to 'pending' so the scout /
    // reserver pipeline re-runs instead of sticking the entry in a half-
    // state forever (e.g. reserver never spawned because of an energy
    // drought — 'reserving' would otherwise sit indefinitely).
    REMOTE_STATE_STALE_TICKS: 5000,

    // Expansion / multi-room
    EXPANSION_PLANNING_INTERVAL: 1000,
    EXPANSION_VETO_TICKS: 1000,
    EXPANSION_MIN_GCL: 2,
    EXPANSION_MIN_HOME_RCL: 4,
    EXPANSION_SEARCH_DEPTH: 2,
    EXPANSION_MAX_CANDIDATES: 12,
};

// Returns the rampart/wall hits target for a given RCL. Unknown RCLs
// clamp to the highest known value (RCL 8) so a higher-level controller
// doesn't fall back to the legacy flat constant.
function rampartTargetFor(rcl) {
    return module.exports.RAMPART_TARGET_HITS_BY_RCL[rcl] ||
           module.exports.RAMPART_TARGET_HITS_BY_RCL[8] || 1000000;
}
module.exports.rampartTargetFor = rampartTargetFor;

// Nuke detection
module.exports.NUKE_SAFE_MODE_TICKS = 5000;
module.exports.NUKE_EVAC_RADIUS = 2;
module.exports.DESIRED_SQUADS_NUKE = 3;
module.exports.NUKE_EVENT_TTL = 60000;

// Remote auto-discovery
module.exports.REMOTE_DISCOVERY_INTERVAL = 5000;
module.exports.REMOTE_AUTO_DISCOVERY_CAP = 2;
module.exports.REMOTE_AUTO_MIN_DISTANCE = 1;
module.exports.REMOTE_AUTO_VETO_TICKS = 1000;
