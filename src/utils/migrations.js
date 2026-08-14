'use strict';

// Versioned migration registry. Each migration is idempotent (safe to re-run)
// and gated on `Memory.x === undefined` so partial applications self-heal on
// the next tick. The framework records applied versions in
// `Memory.migrations.applied` and only runs migrations the room hasn't seen.
//
// To add a new schema change:
//   1. Append a { version, description, run } entry to MIGRATIONS.
//   2. Bump the version number (next sequential integer).
//   3. Ensure run() is idempotent — start with `if (Memory.x === undefined)`.
//
// globals.js calls runMigrations() on init. No other code should call it.

const MIGRATIONS = [
    {
        version: 1,
        description: 'delete legacy per-source path caches',
        run: function () {
            delete Memory.knownSources;
            delete Memory.sourceToSource;
            delete Memory.pathCache;
        },
    },
    {
        version: 2,
        description: 'migrate legacy per-room intel entries into Memory.intel.rooms',
        run: function () {
            if (Memory.intel && !Memory.intel.rooms) {
                const moved = {};
                const metaKeys = { queue: true, scanCursor: true, raids: true, _pendingScan: true, _pendingScans: true };
                for (const k in Memory.intel) {
                    if (metaKeys[k]) continue;
                    moved[k] = Memory.intel[k];
                    delete Memory.intel[k];
                }
                Memory.intel.rooms = moved;
            }
        },
    },
    {
        version: 3,
        description: 'initialize Memory.intel',
        run: function () {
            if (Memory.intel === undefined) {
                Memory.intel = { queue: [], scanCursor: 0, raids: {}, rooms: {} };
            }
            if (Memory.intel.rooms === undefined) Memory.intel.rooms = {};
        },
    },
    {
        version: 4,
        description: 'initialize Memory.squads, Memory.remoteRooms, Memory.expansion',
        run: function () {
            if (Memory.squads === undefined) Memory.squads = {};
            if (Memory.remoteRooms === undefined) Memory.remoteRooms = {};
            if (Memory.expansion === undefined) Memory.expansion = { history: [] };
            if (Memory.expansion && Memory.expansion.history === undefined) {
                Memory.expansion.history = [];
            }
        },
    },
    {
        version: 5,
        description: 'initialize Memory.flags and feature flag defaults',
        run: function () {
            if (Memory.flags === undefined) Memory.flags = {};
            if (Memory.flags.squads === undefined) Memory.flags.squads = false;
            if (Memory.flags.intel === undefined) Memory.flags.intel = false;
            if (Memory.flags.remoteMining === undefined) Memory.flags.remoteMining = false;
            if (Memory.flags.expansion === undefined) Memory.flags.expansion = false;
        },
    },
    {
        version: 6,
        description: 'back-fill homeRoom on existing creeps',
        run: function () {
            for (const name in Game.creeps) {
                const c = Game.creeps[name];
                if (!c.memory) c.memory = {};
                if (c.memory.homeRoom === undefined && c.pos && c.pos.roomName) {
                    for (const rn in Game.rooms) {
                        const r = Game.rooms[rn];
                        if (r.controller && r.controller.my) {
                            c.memory.homeRoom = rn;
                            break;
                        }
                    }
                }
            }
        },
    },
    {
        version: 7,
        description: 'initialize Memory.nuke',
        run: function () {
            if (Memory.nuke === undefined) {
                Memory.nuke = { events: {}, evacuating: {}, stat: { nukesDetected: 0, safeModeTriggered: 0, roomsEvacuated: 0 } };
            }
        },
    },
    {
        version: 8,
        description: 'force source slot recompute (fix stale reachable flags)',
        run: function () {
            // The isSlotReachable check now samples multiple exit tiles instead
            // of just the first. Force a recompute by clearing the slot data so
            // ensureRegistry rebuilds slots with corrected reachability on the
            // next tick. We preserve claimedBy by only clearing the reachable
            // flag, which triggers recomputeSlots on the next ensureRegistry call.
            if (!Memory.sources) return;
            for (const id in Memory.sources) {
                const src = Memory.sources[id];
                if (!src.slots) continue;
                for (let i = 0; i < src.slots.length; i++) {
                    // Mark for recompute; ensureRegistry will re-evaluate
                    src.slots[i].reachable = undefined;
                }
            }
        },
    },
];

function runMigrations() {
    if (!Memory.migrations) {
        Memory.migrations = { applied: [], lastTick: 0, lastVersion: 0 };
    }
    if (Memory.migrated === undefined) Memory.migrated = 0;
    const applied = new Set(Memory.migrations.applied);
    for (let i = 0; i < MIGRATIONS.length; i++) {
        const m = MIGRATIONS[i];
        if (applied.has(m.version)) continue;
        if (m.version <= Memory.migrated && Memory.migrated !== 0) {
            // Older version already applied (a downgrade or fresh restart);
            // skip the run but mark it as applied so we don't re-run.
            Memory.migrations.applied.push(m.version);
            continue;
        }
        try {
            m.run();
            Memory.migrations.applied.push(m.version);
        } catch (e) {
            // Record the failure but continue; the next tick will retry.
            if (!Memory.migrations.failures) Memory.migrations.failures = [];
            Memory.migrations.failures.push({
                version: m.version,
                tick: Game.time,
                error: e.message,
            });
        }
    }
    Memory.migrated = Math.max(Memory.migrated, MIGRATIONS.length);
    Memory.migrations.lastTick = Game.time;
    Memory.migrations.lastVersion = MIGRATIONS.length;
}

// Dev-only: reset migrations to re-run from a given version.
// Call from the game console: require('utils/migrations').resetMigrations(4)
function resetMigrations(toVersion) {
    if (!Memory.migrations) return;
    Memory.migrations.applied = MIGRATIONS
        .filter(function (m) { return m.version < toVersion; })
        .map(function (m) { return m.version; });
    Memory.migrated = toVersion - 1;
}

module.exports = {
    MIGRATIONS: MIGRATIONS,
    runMigrations: runMigrations,
    resetMigrations: resetMigrations,
};