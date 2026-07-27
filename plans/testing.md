# Testing — Coverage Plan

Status: **Planned**. Closes test coverage gaps for (a) the new
defense / remote-mining / multi-room features and (b) existing untested
modules. The repo uses Node's built-in test runner (`node --test`) with
`tests/mocks/screeps.js` providing Screeps globals.

## Current coverage

### Tested

- `tests/config/roles.test.js`
- `tests/economy/creepsBodies.test.js`, `creepsQuotas.test.js`,
  `sourceRegistry.test.js`
- `tests/managers/creepManager.test.js`, `creepRunner.test.js`,
  `spawnManager.test.js`
- `tests/managers/upkeep/linkService.test.js`,
  `towerService.test.js`
- `tests/planning/constructionPlanner.test.js`,
  `strategies/rampartStrategy.test.js`
- `tests/services/depositService.test.js`, `energyService.test.js`
- `tests/tasks/types/taskHarvest.test.js`, `taskHaul.test.js`,
  `taskHeal.test.js`, `taskMine.test.js`
- `tests/utils/memorySchema.test.js`, `moveUtil.test.js`,
  `roomFlags.test.js`

### Gaps (existing code, no tests yet)

| Module | Priority | Why |
|---|---|---|
| `src/tasks/types/taskDefend.js` | high | combat correctness; targeting tiers, retreat threshold |
| `src/tasks/types/taskBuild.js` | medium | self-refueling + construction targeting |
| `src/tasks/types/taskRepair.js` | medium | critical vs non-critical split |
| `src/tasks/types/taskUpgrade.js` | medium | priority escalation (emergency / urgent / critical) |
| `src/tasks/types/taskSupply.js` | medium | supply-critical threshold |
| `src/tasks/types/taskSweep.js` | low | simple but exercises `droppedEnergy` snapshot |
| `src/tasks/types/taskRemoteHarvest.js` | medium | cross-room dispatch logic |
| `src/tasks/types/taskRenew.js` | low | thin wrapper |
| `src/tasks/taskBase.js`, `taskBaseClass.js`, `taskRegistry.js` | medium | core scheduling primitives |
| `src/managers/roomManager.js` | high | snapshot correctness underpins everything |
| `src/managers/upkeep/memoryCleanupService.js` | medium | ghost-cleanup logic |
| `src/managers/upkeep/safeModeService.js` | high | safe-mode trigger thresholds |
| `src/managers/upkeep/stuckRecycleService.js` | low | feature-flagged |
| `src/managers/upkeep/watchdogService.js` | low | error ring buffer |
| `src/planning/plannerUtils.js` | medium | shared helpers |
| `src/planning/strategies/extensionStrategy.js` | medium | siting correctness |
| `src/planning/strategies/containerStrategy.js`, `linkStrategy.js`, `roadStrategy.js`, `storageStrategy.js`, `towerStrategy.js` | low-medium | per-strategy siting |
| `src/utils/assert.js`, `logger.js`, `spawnUtil.js` | low | utility wrappers |

## New feature tests (from defense / remote-mining / multi-room plans)

### Defense

`tests/managers/squadManager.test.js`:
- Squad formation: healer moves toward leader when > `SQUAD_FORMATION_RANGE`
  tiles apart.
- Target sharing: `squadTarget` propagates to both creeps; latched for
  `SQUAD_TARGET_LATCH_TICKS`.
- Mutual retreat: both creeps retreat when either < `SQUAD_RETREAT_HP_RATIO`
  of hits.
- Healer re-pairs after fighter death (calls `findUnpairedFighter`).
- Fighter continues solo after medic death (`squadId` cleared).

`tests/managers/upkeep/intelService.test.js`:
- Observer queue rotation: observer scans the next room in the queue.
- Intel write: `Memory.intel[roomName]` populated with `lastSeen`,
  `hostiles`, `hostileStructures`, `sources`.
- Raid detection: 3+ hostiles in a scanned room within distance 2 of an
  owned room sets `Memory.intel.raids[roomName]`.
- Raid decay: raid cleared after `INTEL_RAID_DECAY_TICKS` with no
  re-detection.
- Queue refresh: queue recomputed every `INTEL_QUEUE_REFRESH_TICKS`.

### Remote mining (one test file per new task + manager)

- `tests/tasks/types/taskScout.test.js` — sets `scoutedTick` on arrival,
  calls `sourceRegistry.registerRemoteSource`, recycles.
- `tests/tasks/types/taskReserve.test.js` — `reserveController` called,
  holds if timer < 1500, releases if enemy-reserved.
- `tests/tasks/types/taskRemoteMine.test.js` — claims remote slot, drops
  into adjacent container; `drop`s on ground if no container.
- `tests/tasks/types/taskRemoteHaul.test.js` — uses `routeCache.getNextStep`
  for cross-room movement; deposits via `depositService` on return.
- `tests/tasks/types/taskRemoteBuild.test.js` — builds container first,
  then road; recycles when no sites remain.
- `tests/tasks/types/taskRemoteDefend.test.js` — spawns on threat, retreats
  when `Game.cpu.bucket < 5000`.
- `tests/managers/remoteManager.test.js` — state machine transitions:
  `pending -> scouted -> reserving -> reserved -> building -> active ->
  contested -> active -> abandoned`.
- `tests/utils/routeCache.test.js` — `getRoute` caches and TTLs;
  `getNextStep` returns the correct next exit; `force: true` recomputes.

### Multi-room / expansion

- `tests/managers/expansionPlanner.test.js` — candidate scoring (source
  count, distance, swamp ratio, mineral penalty, room-allow flag bonus);
  veto window; GCL / RCL gating; highway room filtering.
- `tests/tasks/types/taskClaim.test.js` — `claimController` called;
  recycles on success; clears `Memory.expansion.target` and recycles on
  enemy-claimed failure.
- `tests/tasks/types/taskBootstrap.test.js` — harvests from local source;
  builds spawn site at `ClaimTarget` flag position; transitions to
  `harvester` role when spawn exists and RCL >= 2.
- `tests/managers/bootstrapManager.test.js` — queues spawn site from
  `ClaimTarget` flag; clears `bootstrapping` when spawn online + RCL 2;
  cancels on failed claim and logs to `Memory.expansion.history`.
- `tests/managers/spawnManager.test.js` (extend) — `creepCountByRole`
  counts creeps by `memory.homeRoom` when `pos.roomName` differs;
  `spawnBody` writes `homeRoom` to memory.
- `tests/managers/creepRunner.test.js` (extend) — bootstrappers exempt
  from send-home guard; idle fallback uses `memory.homeRoom`.

## Mock extensions (`tests/mocks/screeps.js`)

Add stubs for globals used by the new features:

- `StructureObserver` with `observeRoom(roomName)` method.
- `Game.map.describeExits(roomName)` returning a fake exit map.
- `Game.map.findRoute(from, to)` returning a fake route array.
- `Game.map.getRoomLinearDistance(a, b)` returning a fake integer.
- `Game.map.isRoomAvailable(name)` returning `true`.
- `StructureLab`, `StructureTerminal` stubs (for future market/lab work;
  cheap to add now).
- `controller.claimController`, `controller.reserveController` methods on
  the controller mock.
- `FIND_EXIT_*` constants if not already present.
- `Game.cpu.bucket` settable per test (already likely present; verify).

## Test conventions (from existing files)

- One `test.js` per source module, mirroring the `src/` path under
  `tests/`.
- Each test file requires `tests/mocks/screeps.js` first to install
  globals.
- Creep mocks: plain object with `pos`, `store`, `memory`,
  `getActiveBodyparts`, `hits` / `hitsMax`, `ticksToLive`.
- Room mocks: plain object with `find`, `controller`, `name`, `storage`.
- No external test framework — use `node:test`'s `describe` / `it` /
  `assert` as the existing tests do.

## Priority order

1. **High-value existing gaps:** `taskDefend`, `roomManager`,
   `safeModeService` — these underpin the combat and snapshot systems the
   new features build on.
2. **Defense feature tests:** `squadManager`, `intelService` — ship with
   the defense work.
3. **Remote-mining tests:** ship alongside each task handler.
4. **Multi-room tests:** ship with the expansion system.
5. **Remaining existing gaps:** fill in opportunistically.

## Definition of done

- `npm test` passes with all new test files.
- Every new `src/` file added by the defense / remote-mining / multi-room
  plans has a corresponding `tests/` file.
- Mock extensions cover all new globals used.
- No drop in existing test pass rate.