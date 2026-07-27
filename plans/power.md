# Power — Power Bank Harvest & Power Spawn Processing

Status: **Planned**. v1 scope: observer-driven detection of `POWER_BANK`
and `POWER_SPAWN` structures, an attack squad dispatch, and a
`processPower` loop on the home room's `STRUCTURE_POWER_SPAWN`.

## Goal

Power creeps (PCs) are a high-RCL feature that dramatically increases
combat and economy strength. v1 ships the *passive* pieces:

1. **Power bank detection** via observer; surface a `[power:bank:room]`
   console notice so the player knows when a bank is ready.
2. **Attack squad dispatch** — a fighter-heavy squad to attack a
   power bank before it decays.
3. **Power processing** — auto-`processPower()` when
   `Game.powerCreeps` has surplus power.

The active *power creep* AI (leveling, renewing, task assignment) is
out of scope for v1.

## Prerequisites / gates

- `controller.level >= 8` (`STRUCTURE_POWER_SPAWN` requires RCL 8).
- `STRUCTURE_OBSERVER` present for bank detection.
- `STRUCTURE_POWER_SPAWN` present for processing.
- `Game.powerCreeps.length > 0` (you have at least one PC).
- Feature flag `Memory.flags.power === true` (off by default).

## A. Power bank detection

`src/managers/powerService.js` (new) — runs per tick (bucket > 5000).

For each owned room with an observer:

1. **Scan the queue.** `Game.map.describeExits` neighbors plus rooms in
   `Memory.power.banks`.
2. **Observe.** Call `observer.observeRoom(target)`. The next tick the
   room is visible; `room.find(FIND_STRUCTURES)` returns power banks.
3. **Record.**

```js
Memory.power.banks[roomName] = {
  id: '<bank id>',
  hits: <number>,
  hitsMax: <number>,
  decay: <tick>,
  power: <expected amount>,
  detectedTick: <Game.time>,
};
```

4. **Alert.** If `decay - Game.time < 3000`, log
   `[power] bank decaying soon in <room> — dispatch attack squad.`
   Set `Memory.power.target = roomName`.

## B. Attack squad dispatch

`src/tasks/types/taskAttackPowerBank.js` (new) — a squad of 6+ fighters
with HEAL parts (existing combat bodies suffice) walks to the bank
room, attacks the bank, and recycles.

The spawn loop in `spawnManager.tryRunForSpawn` checks
`Memory.power.target` and bumps `desiredSquads` to
`DESIRED_SQUADS_POWER` (default 4) while a bank is live. The squad
follows the existing `squadManager` formation logic.

The `squadManager.runSquad` is extended to recognize "bank" rooms:
the target is a `STRUCTURE_POWER_BANK` instead of a hostile creep.
`taskDefend` and `taskAttackPowerBank` share a base — both call
`creep.attack(target)`, the only difference is the target type and
the post-attack recycle.

## C. Power spawn processing

`Game.powerCreeps[i].processPower()` consumes power to generate
class-specific abilities (operator/general). When
`Game.powerCreeps[i].power > PROCESS_THRESHOLD` (default 1000), the
power spawn has `STRUCTURE_POWER_SPAWN.store[RESOURCE_POWER] > 0` and
is `cooldown === 0`, call `processPower`.

This is a single 3-line `if` in `powerService.tick`. No new task.

## D. Configuration

| Constant | Default | Description |
|---|---|---|
| `POWER_BANK_ALERT_TICKS` | 3000 | Alert when bank decays in < N ticks |
| `POWER_BANK_MIN_POWER` | 1000 | Skip banks with < 1000 expected power |
| `DESIRED_SQUADS_POWER` | 4 | Squads spawned when a bank is live |
| `POWER_PROCESS_THRESHOLD` | 1000 | Min power to trigger processPower |
| `POWER_QUEUE_REFRESH_TICKS` | 1000 | Recompute observation queue |

## E. Files to add / change

| Path | Type |
|---|---|
| `src/managers/powerService.js` | new — bank detection + processing |
| `src/tasks/types/taskAttackPowerBank.js` | new — squad attack on bank |
| `src/tasks/tasksIndex.js` | register `attackPowerBank` |
| `src/config/priorities.js` | `ATTACK_POWER_BANK: 11` (defend tier) |
| `src/config/constants.js` | add the constants above |
| `src/managers/spawnManager.js` | bump `desiredSquads` when `Memory.power.target` is set |
| `src/managers/squadManager.js` | support power-bank target type (id is a `STRUCTURE_POWER_BANK`) |
| `src/managers/roomManager.js` | snapshot `powerBanks: room.find(FIND_STRUCTURES, {filter: STRUCTURE_POWER_BANK})` |
| `src/main.js` | call `powerService.tick()` |
| `src/utils/memorySchema.js` | accessors for `Memory.power`, `Memory.power.banks` |
| `tests/mocks/screeps.js` | add `STRUCTURE_POWER_BANK`, `STRUCTURE_POWER_SPAWN`, `Game.powerCreeps`, `powerCreep.processPower`, `STRUCTURE_POWER_BANK` decay property |

## F. Memory layout

```js
Memory.power = {
  banks: {
    [roomName]: {
      id: '<id>',
      hits: 1000000,
      hitsMax: 1000000,
      decay: 0,
      power: 5000,
      detectedTick: 0,
    },
  },
  target: null,    // roomName with a live bank being attacked
  queue: [],       // observation queue (mirrors intelService)
  scanCursor: 0,
  lastProcessTick: 0,
  stat: {
    banksDetected: 0,
    banksDefeated: 0,
    powerProcessed: 0,
  },
};
```

## G. Migration

- Bump `Memory.migrated` to **8** in `globals.js`.
- Initialize `Memory.power = { banks: {}, target: null, queue: [], scanCursor: 0, lastProcessTick: 0, stat: {...} }`.
- Set `Memory.flags.power = false` if not already.

## H. Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| Bank decay warning missed | Observer queue drift | `powerService` refreshes queue every 1000 ticks |
| Squad wiped at bank | Bank defended | Spawn one more squad; player should manually join or retreat |
| Power spawn never processes | Cooldown or threshold too high | Lower `POWER_PROCESS_THRESHOLD`; check `STRUCTURE_POWER_SPAWN.cooldown` |
| Power creeps idle | v1 doesn't manage PC tasks | v2: `pcManager` to assign upgrade/operator/general duties |

## I. Open questions (v2)

- **PC AI.** v1 only consumes the result of existing PCs.
  v2 would level a `POWER_CLASS.OPERATOR` for energy ops, a
  `POWER_CLASS.GENERAL` for boosts.
- **Multi-room bank hunt.** v1 scans the observer's neighbors.
  v2 could use `Game.map.findRoute` to depth-3 search.
- **Bank defense prediction.** Banks can be defended by NPC keepers
  in some shards. v1 doesn't predict; v2 would scout before
  dispatching.
- **Power credit arbitrage.** Selling power to other players via the
  market (via `ORDER_SELL power`) when supply > demand.
