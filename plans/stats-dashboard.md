# Stats Dashboard — Per-Module CPU, GCL/RCL Trends, Energy Income

Status: **Planned**. v1 scope: a `statsService` that runs once per
100 ticks, aggregates per-module CPU, GCL/RCL progression, and
energy income from the existing snapshot, and writes a `console.log`
ASCII table. Optionally exposes a queryable API for the in-game
`Game.cpu.getHeapStatistics()` and the existing `Memory.stats` ring
buffer.

## Goal

`src/main.js` already records a 120-tick rolling buffer of
`{tick, bucket, cpu}` into `Memory.stats.cpuHistory`. The new
service extends this to:

1. **Per-module CPU.** `assert.safeTick` / `safeRun` already catch
   errors but don't time their wrapped functions. Wrap them in a
   `timedRun(module, fn)` to record `Memory.stats.cpuByModule[module]`.
2. **GCL/RCL per owned room.** Sample each tick; aggregate by minute.
3. **Energy income/expense.** Read the existing snapshot for storage
   delta, container delta, dropped-energy delta. Subtract to compute
   net income.
4. **Console table.** Every 100 ticks, log a small table to
   `console.log` so the player can spot trends without opening the
   memory API.

## A. New: `src/utils/statsService.js`

```js
let _tick = -1;
let _perModule = {};

function tickStart() {
    if (_tick === Game.time) return;
    _tick = Game.time;
    _perModule = {};
}

function recordModule(module, usedMs) {
    _perModule[module] = (_perModule[module] || 0) + usedMs;
}

function snapshot() {
    // Returns { modules: { roomManager: 12, creepManager: 8, ... },
    //           total: 28 }
    const total = Object.values(_perModule).reduce((a, b) => a + b, 0);
    return { modules: _perModule, total: total };
}

function aggregate() {
    // Called every 100 ticks. Pushes into Memory.stats.cpuHistoryByModule
    if (!Memory.stats) Memory.stats = {};
    if (!Memory.stats.cpuByModule) Memory.stats.cpuByModule = {};
    for (const m in _perModule) {
        if (!Memory.stats.cpuByModule[m]) Memory.stats.cpuByModule[m] = [];
        Memory.stats.cpuByModule[m].push({ tick: Game.time, ms: _perModule[m] });
        if (Memory.stats.cpuByModule[m].length > 120) Memory.stats.cpuByModule[m].shift();
    }
    // Reset for the next 100-tick window
    _perModule = {};
    _tick = Game.time;
}

function logTable() {
    if (Game.time % 100 !== 0) return;
    const snap = snapshot();
    const lines = [];
    lines.push('[' + Game.time + '] [stats]');
    lines.push('  CPU: total=' + snap.total.toFixed(2) + 'ms bucket=' + Game.cpu.bucket);
    for (const m in snap.modules) {
        const pct = (snap.modules[m] / snap.total * 100).toFixed(1);
        lines.push('    ' + m.padEnd(20) + snap.modules[m].toFixed(2).padStart(8) + 'ms  (' + pct + '%)');
    }
    console.log(lines.join('\n'));
}
```

## B. `assert.js` changes

The current `safeRun` and `safeTick` are pass-through wrappers. Add a
timed variant that records the wrapped function's CPU.

```js
const stats = require('./statsService');

function safeRunTimed(module, fn) {
    const start = Game.cpu.getUsed();
    let result;
    try {
        result = fn();
    } catch (e) {
        recordError(module, e);
        return null;
    }
    const used = Game.cpu.getUsed() - start;
    stats.recordModule(module, used);
    return result;
}
```

The existing `safeRun` is preserved for compatibility. `src/main.js`
switches the top-level module wrappers to `safeRunTimed` so the
`roomManager`, `creepManager`, etc. timings are recorded.

## C. Energy income / expense

`src/utils/statsService.energyFlow(snapshots, prevSnap)` — computes
the net change in storage + container energy + dropped energy across
two snapshots. Returns `{ net, storageDelta, containerDelta, droppedDelta }`.

`src/managers/roomManager.snapshotFor` returns a frozen object; the
service keeps the previous tick's snapshot in module memory and
compares. The result is logged every 100 ticks:

```
[stats] energy flow last 100t: +3200 (storage +500, container +2400, dropped +300, expense -?)
```

Expense is the harder side — the AI deposits energy but also spends
it on spawning, building, repairing, upgrading. v1 logs only the
**net** plus the source breakdown. v2 would track spawn/upgrade
costs explicitly.

## D. GCL / RCL trend

Every 100 ticks, `statsService` reads `Game.gcl.progress` and
`Game.gcl.progressTotal` for each owned room's controller. The
delta is the upgrade-rate over the last 100 ticks, in energy / tick.

```js
if (Game.time % 100 === 0) {
    for (const rn in Game.rooms) {
        const r = Game.rooms[rn];
        if (!r.controller || !r.controller.my) continue;
        const ctl = r.controller;
        const prev = Memory.stats.rclHistory[rn];
        if (prev) {
            const dp = ctl.progress - prev.progress;
            const dt = Game.time - prev.tick;
            // dp / dt = energy/tick of upgrade
        }
        Memory.stats.rclHistory[rn] = { tick: Game.time, progress: ctl.progress };
    }
}
```

## E. Files to add / change

| Path | Type |
|---|---|
| `src/utils/statsService.js` | new — aggregation + table |
| `src/utils/assert.js` | add `safeRunTimed`, `safeTickTimed` |
| `src/main.js` | switch top-level wrappers to `safeRunTimed` |
| `src/utils/memorySchema.js` | accessors for `Memory.stats.cpuByModule`, `Memory.stats.rclHistory` |
| `src/managers/roomManager.js` | keep last tick's snapshot for the energy flow diff |
| `src/main.js` | call `statsService.logTable()` and `statsService.aggregate()` every 100 ticks |

## F. Memory layout

```js
Memory.stats = {
    startTick: <number>,           // existing
    errors: { module: count },     // existing
    lastErrors: [...],             // existing
    cpuHistory: [{ tick, bucket, cpu }],  // existing, 120 samples
    cpuByModule: {                 // new
        roomManager: [{ tick, ms }],  // 120 samples
        creepManager: [...],
        spawnManager: [...],
    },
    rclHistory: {                  // new
        [roomName]: { tick, progress },
    },
    energyFlow: {                  // new (rolling 120)
        net: 0, storage: 0, container: 0, dropped: 0,
    },
    stat: {
        ticksRun: 0,
        lastResetTick: 0,
    },
};
```

## G. Test plan (`tests/utils/statsService.test.js`)

```js
test('records per-module CPU', () => {
    statsService.tickStart();
    statsService.recordModule('roomManager', 12);
    statsService.recordModule('creepManager', 8);
    const snap = statsService.snapshot();
    assert.equal(snap.modules.roomManager, 12);
    assert.equal(snap.modules.creepManager, 8);
    assert.equal(snap.total, 20);
});

test('aggregates into Memory.stats.cpuByModule every 100 ticks', () => {
    statsService.tickStart();
    statsService.recordModule('roomManager', 10);
    Game.time = 100;  // simulate tick boundary
    statsService.aggregate();
    assert.ok(Memory.stats.cpuByModule.roomManager);
    assert.equal(Memory.stats.cpuByModule.roomManager.length, 1);
});

test('caps cpuByModule at 120 samples', () => {
    for (let t = 0; t < 200; t++) {
        Game.time = t;
        statsService.tickStart();
        statsService.recordModule('test', 1);
        if (t % 100 === 0) statsService.aggregate();
    }
    assert.ok(Memory.stats.cpuByModule.test.length <= 120);
});
```

## H. Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| `Memory.stats.cpuByModule` unbounded | Aggregation never called | Verify `main.js` calls `statsService.aggregate()` |
| Energy flow wildly wrong | Snapshot diff crosses a tick boundary where a haul completes | Acceptable noise; the 100-tick window smooths it |
| Module missing from log | Wrapped in `safeRun` not `safeRunTimed` | Switch top-level wrappers |
| `Game.cpu.getUsed()` returns 0 on sim shard | Sim doesn't track CPU | Document; stat is best-effort on sim |

## I. Open questions (v2)

- **Heap statistics.** `Game.cpu.getHeapStatistics()` exposes V8
  memory. v1 doesn't track it; v2 would sample.
- **Per-creep CPU.** Track which roles consume the most. Requires
  per-creep `Game.cpu.getUsed()` deltas (Screeps doesn't expose
  this directly; would need a manual accumulator).
- **Web UI.** Push to an external Grafana / InfluxDB via
  `RawMemory.setActiveSegments` (shard3 only).
- **Per-room income breakdown.** Distinguish haul from upgrade from
  storage decay.
