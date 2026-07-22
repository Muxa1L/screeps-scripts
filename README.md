# screeps-scripts

A task-queued Screeps AI with a snapshot-driven room model, role-restricted creep
dispatcher, and a per-tick cap-aware scheduler. Single-room focused; a `room_allow:`
flag whitelist permits surplus harvesters to commute to sources in adjacent unowned rooms
(see [In-game flags](#in-game-flags) and [Remote harvest dispatch](#remote-harvest-dispatch)).
A full remote-mining pipeline (scout / reserve / build / mine / haul / defend) is designed
but not yet implemented (see `plans/remote-mining.md`).

## Architecture

```
main.js              - Screeps-required root entry point; delegates to src/main
src/
  main.js            - per-tick loop with bucket gating
  config/
    constants.js     - numeric thresholds and limits
    priorities.js    - task priority constants
    roles.js         - role -> allowed-task metadata
  utils/
    memorySchema.js  - safe typed accessors for Memory / creep.memory
    moveUtil.js      - path/move helpers with failure tracking
    spawnUtil.js     - spawn helpers
    roomFlags.js     - Screeps flag helpers ('haul:' priority containers, 'room_allow:' foreign-room whitelist)
    logger.js        - per-category logging
    assert.js        - safeTick wrappers
  managers/
    roomManager.js   - builds an immutable per-room snapshot each tick
    creepManager.js  - per-creep task selection + dispatch (thin scheduler)
    creepRunner.js   - task switching, assignment, renew/recycle helpers
    spawnManager.js  - quota-driven spawning + emergency defender spawning
    upkeepManager.js - towers, links, safe mode, memory cleanup, stuck recycle
  economy/
    sourceRegistry.js - per-source mining slots with claim/release
    creepsBodies.js   - tiered body templates per role, cost-aware selection
    creepsQuotas.js   - RCL-based role quotas with controller-ttd and storage-ratio contextual boosting
  planning/
    constructionPlanner.js - orchestrator for extension/road/container/link/tower/storage siting
    plannerUtils.js        - shared construction-planning helpers
    strategies/*.js        - one strategy per structure type
  services/
    energyService.js  - shared source selection (storage/containers/dropped/harvest)
    depositService.js - shared deposit selection (spawn/extension/tower/storage/container)
  tasks/
    taskBase.js       - task model, distance heuristics, path-score cache
    taskBaseClass.js  - TaskType wrapper around plain data-driven specs
    tasksIndex.js     - registry of task specs
    types/task*.js    - one file per task type (harvest, mine, haul, ...)
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
6. Runs the task handler. If it returns `false`, the task is released, the
   target id is added to a per-creep failed-task blacklist for ~5 ticks
   (`memory.addFailedTask`), and the creep re-evaluates next tick. This stops
   a stale target from preempting a good task every tick only to fail on run.

Non-combat creeps in rooms the player does not own are sent home instead of
taking tasks there: a harvester that dips across a border would otherwise pick
up foreign `sweep`/`haul` targets with no owned deposit to empty into and
thrash on them. The guard in `runCreep` releases the current task and paths
to the nearest spawn (`return->home`), unless the room is on the `room_allow:`
whitelist. Combat roles (fighter/healer) are exempt and operate across rooms.
`forceTargetFor` (the idle force-harvest fallback) also returns null for
unowned rooms, so a stranded creep walks home rather than latching onto a
foreign source.

Cap lookups are cached per `type:roomName` per tick (`_capCache`). Task type
`capFor` callbacks (e.g. `taskHaul`) are now wired through `taskBaseClass`.

### Roles & restrictions

Creep role is inferred from name prefix (`Miner...`, `Hauler...`, etc.) and
stored in `creep.memory.role`. `src/config/roles.js` maps roles to the task
types they may take:

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

Defined in `src/config/priorities.js` (re-exported via `taskBase.PRIORITY`). Lower number = higher priority.

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
| REMOTE_HARVEST     | 95    | taskRemoteHarvest  |
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

## Shared services and memory schema

- `src/services/energyService.js` centralizes all energy-source selection:
  storage first, then dropped resources (they decay, so they take precedence
  over containers), then containers, with `haul:` flagged priority containers
  preferred over regular containers, then source harvesting when allowed.
  `findEnergySource` accepts an `options.anchor` (defaults to the creep) so
  callers can score candidates by distance from a fixed point — `taskUpgrade`
  passes the controller so upgraders prefer the controller-side container
  rather than walking to a mining-side container or a source. This logic was
  previously duplicated across `taskBuild`, `taskRepair`, and `taskUpgrade`.
- `src/services/depositService.js` centralizes deposit selection for haulers,
  sweepers, and suppliers, with a configurable priority order and per-resource
  handling. Containers marked with a `haul:` flag are chosen before other
  deposits so energy can be staged closer to where it is needed.
- `src/utils/memorySchema.js` provides safe typed accessors for all
  `creep.memory` and `Memory` keys used by the AI. All setters initialize
  missing parent objects so callers never have to guard against undefined
  intermediate keys.

## In-game flags

Screeps flags can influence behavior. `haul:` flags are placed on containers;
`room_allow:` flags may be placed anywhere. Flags are matched by **prefix** in
the flag name (case-insensitive).

| Prefix          | Effect                                                                              |
|-----------------|-------------------------------------------------------------------------------------|
| `haul:`         | Marks the container as a priority haul cache. Haulers will deliver here first, and   |
|                 | non-haulers will withdraw from it before normal containers. Useful for staging      |
|                 | energy near a controller, spawn cluster, or construction site.                      |
| `room_allow:`   | Whitelists a foreign room for non-combat creeps. The allowed room name is parsed     |
|                 | from the flag name (e.g. `room_allow:E42S26`), so the flag's position is irrelevant. |
|                 | A creep in a whitelisted room is not sent home and may take tasks there (e.g.        |
|                 | harvest an unowned source). A full creep still walks home to deposit, since there    |
|                 | is no owned deposit in a foreign room. Surplus harvesters are also dispatched there  |
|                 | from home via the `remoteHarvest` task — see [Remote harvest dispatch](#remote-harvest-dispatch). |

### Remote harvest dispatch

With a `room_allow:<room>` flag in place, surplus harvesters commute to the whitelisted
room's sources via the `remoteHarvest` task. An empty harvester in the home room with no
local work it can take is assigned `remoteHarvest@<remoteSource>`; it walks cross-room to
the target and releases on arrival, handing off to the per-room `harvest` task (the remote
room's snapshot lists its sources). When full it walks home to deposit — `forceTargetFor`
returns null for unowned rooms so the idle fallback paths to the nearest spawn — then empty
again at home it is re-dispatched.

`remoteHarvest` priority (95) sits just above `HARVEST` (90) and below every other in-room
task, so it is a **surplus-labor** fallback: a harvester commutes only when there is no
local work (local harvest slots capped, no sweep/haul/build available). The priority is
tunable in `src/config/priorities.js`. Sources in a whitelisted room are discovered the first
time a creep enters it: the main loop registers them into `Memory.sources` via
`sourceRegistry.ensureRegistry`. Until then a synthetic scout target at the room center
dispatches a creep there to bootstrap discovery.

Example flag names: `haul:controller`, `haul:spawn`, `haul:extensions`, `room_allow:E42S26`.

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
| upkeepManager | > 500            |

When the bucket is low, creeps stop running first, then spawning, then upkeep.
`roomManager` always runs so snapshots stay fresh.

## Tooling

- **Lint:** `npm run lint` (ESLint flat config in `eslint.config.mjs`).
- **Lint fix:** `npm run lint:fix`.
- **Test:** `npm test` (Node built-in test runner + `tests/mocks/screeps.js`).
- **Build:** `npm run build` bundles all `src/` modules and the root `main.js`
  shim into a single `dist/main.js` file. Screeps does not support subfolders,
  so the build resolves CommonJS `require` calls internally and produces one
  uploadable module.
- **Deploy:** `npm run deploy` builds and pushes `dist/main.js` to Screeps using
  `screeps-api`. Set credentials in `.env`:
  ```
  SCREEPS_TOKEN=your-token
  SCREEPS_BRANCH=main
  # or for a private server:
  SCREEPS_EMAIL=email
  SCREEPS_PASSWORD=password
  SCREEPS_HOST=localhost
  SCREEPS_PORT=21025
  SCREEPS_PROTOCOL=http
  ```
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