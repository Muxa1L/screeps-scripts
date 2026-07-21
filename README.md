# screeps-scripts

A task-queued Screeps AI with a snapshot-driven room model, role-restricted creep
dispatcher, and a per-tick cap-aware scheduler. Single-room focused; remote mining
is designed but not yet implemented (see `plans/remote-mining.md`).

## Architecture

```
main.js
  globals        - per-tick memory init, room-memory housekeeping
  roomManager    - builds an immutable per-room snapshot each tick
  creepManager   - per-creep task selection + dispatch (the scheduler)
  spawnManager   - quota-driven spawning + emergency defender spawning
  misc.upkeep    - towers, links, safe mode, memory cleanup, stuck recycle

Task system
  taskBase / taskBaseClass - task model, priorities, distance heuristics, cache
  taskRegistry / tasksIndex - lists available tasks per room from a snapshot
  taskHandlers              - thin dispatcher to per-type run functions
  task*.js                  - one file per task type (harvest, mine, haul, ...)

Support
  sourceRegistry      - per-source mining slots with claim/release
  constructionPlanner - extension/road/container/link/tower/storage siting
  creepsBodies        - tiered body templates per role, cost-aware selection
  creepsQuotas        - RCL-based role quotas with controller-ttd boosting
  spawnUtil / moveUtil / logger / assert - utilities
```

### Snapshot model

`roomManager.tick()` runs first each tick and builds a frozen per-room snapshot
(hostiles, damaged friendlies, construction sites, dropped energy, tombstones,
ruins, damaged structures, sources, energy structures, containers, links,
storage, controller state). All task generators and the scheduler read from
the snapshot instead of re-scanning `room.find` repeatedly.

### Task scheduler

For each creep, `creepManager.runCreep`:

1. Refreshes claim counts (`_claimCounts`) at tick start and **incrementally**
   as creeps take/release tasks, so caps are enforced fairly across the loop.
2. Loads the cached task list for the creep's room (`_taskListCache`).
3. Finds the creep's current task by id (if any).
4. Calls `bestTaskFor` which filters by role-allowed types, `canDo`, cap
   availability, energy state, and a failed-task blacklist; sorts candidates
   by `(priority * 1000 + approxDistance)` and returns the best.
5. Decides whether to switch via `shouldSwitch` (priority must be better, or
   equal priority + closer after a 5-tick cooldown).
6. Runs the task handler. If it returns `false`, the task is released and the
   creep re-evaluates next tick.

Cap lookups are cached per `type:roomName` per tick (`_capCache`). Task type
`capFor` callbacks (e.g. `taskHaul`) are now wired through `taskBaseClass`.

### Roles & restrictions

Creep role is inferred from name prefix (`Miner...`, `Hauler...`, etc.) and
stored in `creep.memory.role`. `RESTRICTED_TASKS` in `creepManager.js` maps
roles to the task types they may take:

| Role      | Allowed tasks                  |
|-----------|--------------------------------|
| miner     | mine                           |
| hauler    | haul, sweep, supply            |
| fighter   | defend                         |
| healer    | heal                           |
| builder   | build, repair, upgrade         |
| upgrader  | upgrade, harvest (refuel only) |
| harvester | (unrestricted)                 |

### Task priorities

Defined in `taskBase.js`. Lower number = higher priority.

| Constant           | Value | Used by            |
|--------------------|-------|--------------------|
| DEFEND             | 10    | taskDefend         |
| RENEW              | 20    | taskRenew          |
| HEAL               | 30    | taskHeal           |
| SUPPLY             | 35    | taskSupply         |
| SWEEP              | 40    | taskSweep          |
| HAUL               | 50    | taskHaul           |
| REPAIR_CRITICAL    | 55    | taskRepair (crit)  |
| BUILD              | 60    | taskBuild          |
| REPAIR             | 65    | taskRepair         |
| UPGRADE            | 70    | taskUpgrade        |
| MINE               | 80    | taskMine           |
| HARVEST            | 90    | taskHarvest        |
| IDLE               | 100   | (fallback)         |

`taskUpgrade.priorityFor` escalates: emergency (ttd<500) -> DEFEND, urgent
(ttd<1500) -> RENEW, critical (ttd<3000) -> SUPPLY. Its cap also scales
(4 / 6 / 8 / 12) with the same thresholds so more creeps can upgrade when
the controller is at risk.

### Stale target re-validation

Task `run` handlers re-fetch live game objects via `Game.getObjectById` before
acting, so a snapshot-captured target that died/completed mid-tick causes the
task to be released cleanly instead of throwing. Applied to: `taskDefend`,
`taskHeal`, `taskRepair`, `taskBuild`, `taskSupply`.

## Feature flags

Set these in the game console via `Memory.flags = { <flag>: true }`. Clear
with `delete Memory.flags.<flag>` or `Memory.flags = {}`.

| Flag             | Effect                                                              |
|------------------|---------------------------------------------------------------------|
| `verbose`        | Logger prints every category (overrides `quiet`).                   |
| `quiet`          | Logger silences all output.                                         |
| `debugStuck`     | Logs fatigue/move-failure diagnostics for each creep each tick.     |
| `stuckRecycle`   | Enables the `misc.upkeep` stuck-recycle loop: creeps idle for 200+  |
|                  | ticks path to a spawn and get recycled. Off by default.             |
| `disableRoads`   | Skips `planRoads` in the construction planner. Other structures    |
|                  | (extensions, containers, links, towers, storage) are still planned. |

Example:

```js
Memory.flags = { verbose: true, disableRoads: true };
```

Per-category log suppression is also available via `Memory.logCategories`:

```js
Memory.logCategories = { creep: false, summary: false };
```

## Bucket gating

`main.js` gates modules by `Game.cpu.bucket` (skipped on the `sim` shard):

| Module        | Bucket threshold |
|---------------|------------------|
| roomManager   | always           |
| creepManager  | > 1000           |
| spawnManager  | > 2000           |
| misc.upkeep   | > 500            |

When the bucket is low, creeps stop running first, then spawning, then upkeep.
`roomManager` always runs so snapshots stay fresh.

## Tooling

- **Lint:** `npm run lint` (ESLint flat config in `eslint.config.mjs`).
- **Lint fix:** `npm run lint:fix`.
- **Husky + lint-staged:** pre-commit hook runs `eslint --fix` on staged `.js`
  files.
- **Screeps globals:** `screeps-globals.json` lists every readonly global
  the Screeps runtime injects. It is consumed by the ESLint config so the
  linter knows about `Game`, `Memory`, `FIND_*`, `STRUCTURE_*`, etc.
  Regenerate it after bumping `@types/screeps`:
  ```bash
  node scripts/generate-globals.js
  ```

### Naming collision gotcha

Screeps exposes many constants as globals (e.g. `BODYPART_COST`, `REPAIR_POWER`,
`BUILD_POWER`). Do not declare module-level `const`/`let` with those names or
the simulator/private server will throw `Identifier has already been declared`.
`creepsBodies.js` uses `PART_COST` (not `BODYPART_COST`) for this reason.

## Memory layout

- `Memory.migrated` - schema version; `2` is current. Bumping re-runs the
  one-shot migration in `globals.js`.
- `Memory.sources[id]` - per-source mining slots (`{roomName, x, y, slots[]}`),
  populated by `sourceRegistry.ensureRegistry`. Slots are recomputed every 500
  ticks to account for structures built on top of them.
- `Memory.rooms[name]` - per-room metadata (`lastSeen`, `lastSafeModeActivate`).
- `Memory.flags` - feature flags (see above).
- `Memory.logCategories` - per-category log enable/disable overrides.
- `Memory.stats.errors[module]` - cumulative error counts per module.
- `Memory.stats.lastErrors[]` - ring buffer of recent error entries.

## Plans

- `plans/remote-mining.md` - design doc for a future remote mining pipeline
  (scout / reserve / build / mine / haul / defend). Not yet implemented.