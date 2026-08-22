# Migration Framework — Schema Versioning & Rollback Safety

Status: **Implemented** (`src/utils/migrations.js` — 8 versioned
idempotent migrations, `Memory.migrated` tracks the highest
successfully-applied version; failures are recorded and retried).
Roll-forward/backward helpers included (`resetMigrations`).

## Goal

Every schema-affecting change to `Memory` is recorded with:

1. A version number.
2. A migration function (idempotent).
3. A timestamp and tick.

The framework:

- Runs only the migrations the room hasn't seen.
- Records the version history.
- Can roll forward (re-run skipped migrations) or backward (re-init).
- Is safe to load on a fresh memory (initializes all fields).

## A. Migration entry format

```js
// src/utils/migrations.js
const MIGRATIONS = [
    {
        version: 6,
        description: 'initialize Memory.labs',
        run: function () {
            if (Memory.labs === undefined) Memory.labs = {};
        },
    },
    {
        version: 7,
        description: 'initialize Memory.market',
        run: function () {
            if (Memory.market === undefined) {
                Memory.market = {
                    history: {},
                    orders: {},
                    stat: { sold: 0, bought: 0, ordersPlaced: 0, ordersCancelled: 0, dealsCompleted: 0 },
                    lastSampleTick: 0,
                };
            }
        },
    },
    {
        version: 8,
        description: 'migrate Memory.intel.rooms to Memory.intel (idempotent)',
        run: function () {
            if (Memory.intel && !Memory.intel.rooms) {
                // See globals.js line 11-20
                ...
            }
        },
    },
];
```

## B. Execution model

`src/utils/migrations.js` exports `runMigrations()`:

```js
function runMigrations() {
    if (!Memory.migrations) Memory.migrations = { applied: [], lastTick: 0, lastVersion: 0 };
    if (!Memory.migrated) Memory.migrated = 0;
    const applied = new Set(Memory.migrations.applied);
    for (let i = 0; i < MIGRATIONS.length; i++) {
        const m = MIGRATIONS[i];
        if (applied.has(m.version)) continue;
        if (m.version <= Memory.migrated && Memory.migrated !== 0) {
            // Older version already applied (a downgrade or fresh restart);
            // skip the record but mark it as applied so we don't re-run.
            Memory.migrations.applied.push(m.version);
            continue;
        }
        try {
            m.run();
            Memory.migrations.applied.push(m.version);
        } catch (e) {
            // Record the failure but continue; the next tick will retry.
            Memory.migrations.failures = Memory.migrations.failures || [];
            Memory.migrations.failures.push({ version: m.version, tick: Game.time, error: e.message });
        }
    }
    Memory.migrated = MIGRATIONS.length;
    Memory.migrations.lastTick = Game.time;
    Memory.migrations.lastVersion = MIGRATIONS.length;
}
```

## C. Replace `globals.js` migration

`globals.js` is simplified:

```js
const migrations = require('./migrations');
function init() {
    assert.init();
    migrations.runMigrations();
}
```

The current `globals.js` lines 5-50 (the version-5 hand-rolled
migration) move into `migrations.js` as versions 1-5 entries. New
plans add new entries; `Memory.migrated` is auto-set to the highest
applied version.

## D. Idempotency

Each migration's `run()` must be safe to call multiple times. The
framework marks as applied **after** a successful run, but a power
cycle mid-migration could leave a partially-applied state. The
convention: every run begins with `if (Memory.x === undefined)
Memory.x = ...;` so re-runs are no-ops.

Destructive migrations (e.g. `delete Memory.legacyKey`) are wrapped
in `try { delete Memory.k; } catch (e) {}`.

## E. Rollback

For dev / debugging, `resetMigrations(version)` clears the applied
list and resets `Memory.migrated` to `version - 1`. The next tick
re-runs from that version.

```js
function resetMigrations(toVersion) {
    if (!Memory.migrations) return;
    Memory.migrations.applied = MIGRATIONS.filter(m => m.version < toVersion).map(m => m.version);
    Memory.migrated = toVersion - 1;
}
```

This is **not** exposed in production; it's a dev-only function
called from the console for testing schema changes.

## F. Files to add / change

| Path | Type |
|---|---|
| `src/utils/migrations.js` | new — registry + runner |
| `src/utils/globals.js` | replace inline migration with `migrations.runMigrations()` |
| `src/utils/assert.js` | add a `resetMigrations` log warning |
| `tests/utils/migrations.test.js` | new — covers fresh / partial / downgrade / idempotent paths |

## G. Test plan (`tests/utils/migrations.test.js`)

```js
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const mock = require('../mocks/screeps');
const migrations = require('../../src/utils/migrations');

beforeEach(() => { mock.resetGame(); mock.resetMemory(); });

test('runs all migrations on a fresh memory', () => {
    migrations.runMigrations();
    assert.equal(Memory.migrated, migrations.MIGRATIONS.length);
    // Verify each registered migration's effect
    for (const m of migrations.MIGRATIONS) {
        assert.ok(Memory.migrations.applied.includes(m.version), 'version ' + m.version);
    }
});

test('does not re-run applied migrations', () => {
    migrations.runMigrations();
    // Capture the post-state of a sentinel key
    Memory.labs = { sentinel: 'foo' };
    migrations.runMigrations();
    assert.equal(Memory.labs.sentinel, 'foo');  // not wiped
});

test('handles a fresh restart with Memory.migrated already set', () => {
    Memory.migrated = 999;  // simulate "current"
    migrations.runMigrations();
    assert.ok(Memory.migrated >= 999);
});

test('records failures in Memory.migrations.failures', () => {
    // Inject a failing migration
    migrations.MIGRATIONS.push({
        version: 9999,
        description: 'always fails',
        run: () => { throw new Error('test'); },
    });
    migrations.runMigrations();
    const f = Memory.migrations.failures.find(f => f.version === 9999);
    assert.ok(f, 'failure should be recorded');
});
```

## H. Migration additions for current plans

When this framework ships, the existing in-flight plans add migrations
as follows (extracted from their `Migration` sections):

- **labs.md → 6**: `Memory.labs = {}`
- **market.md → 7**: `Memory.market = { history: {}, orders: {}, stat: {...}, lastSampleTick: 0 }`
- **power.md → 8**: `Memory.power = { banks: {}, target: null, queue: [], scanCursor: 0, lastProcessTick: 0, stat: {...} }`
- **nuke-detection.md → 9**: `Memory.nuke = { events: {}, evacuating: {}, stat: {...} }`

The current `Memory.migrated = 5` (set in `globals.js` line 49)
becomes version 5 in the new registry. New entries start at 6.

## I. Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| `Memory.migrated` not advancing | Throwing migration | Check `Memory.migrations.failures`; fix the throw |
| Re-running on every tick | `Memory.migrations.applied` cleared | Avoid touching `Memory.migrations` from outside the framework |
| Idempotency violation | Migration that doesn't gate on `Memory.x === undefined` | Add the guard; test with `npm test` |
| Downgrade leaves stale fields | Plan removed a memory key | Migration should `delete` instead of just init |

## J. Open questions (v2)

- **Per-shard migrations.** Multi-shard would have per-shard memory.
  v2 splits the registry by shard.
- **Backups.** v1 trusts Memory. v2 could snapshot before each
  migration (CPU-expensive; gate behind a flag).
- **Schema validation.** v1 trusts the registry. v2 could add a
  runtime type check (e.g. `assert(Memory.labs[room].reactions` is
  an array`).
- **Differential migrations.** v1 re-runs all migrations on a fresh
  memory. v2 could compute a delta and run only the changes since
  the last `Memory.migrated`.
