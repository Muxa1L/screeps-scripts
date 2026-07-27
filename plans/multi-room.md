# Multi-Room — Per-Room Management & Expansion

Status: **Planned**. v1 scope: per-room generalization + GCL-aware expansion
planner + claim-and-settle flow.

## Goal

Generalize the AI from single-room to N owned rooms, then add an expansion
system that picks target rooms, claims them, and bootstraps them to
self-sufficiency.

Three subsystems, implemented in order:

1. **Per-room generalization** — make spawnManager, creepRunner, and
   memory ownership work cleanly across N owned rooms.
2. **Expansion planner** — score candidate rooms and pick targets within
   GCL budget.
3. **Claim-and-settle flow** — claimer + bootstrapper tasks plus a
   bootstrap manager that brings a new room online.

## Prerequisites / gates

- GCL >= 2 for any expansion (1 additional room per GCL level above 1).
- RCL >= 4 in the home room before expansion is considered (need storage +
  4 extensions to bootstrap a new room efficiently).
- `Memory.expansion` initialized (see Migration).
- Feature flag `Memory.flags.expansion === false` default; the full
  expansion system is a no-op until set to `true`.

## A. Per-room generalization

The snapshot model already handles N rooms (`roomManager.tick` snapshots
every visible room). The remaining single-room assumptions:

| Current | Change |
|---|---|
| `spawnManager.tick` iterates `Game.spawns` — already multi-room | no change |
| `spawnManager.creepCountByRole(roomName)` filters by `c.pos.roomName` | extend to also count creeps whose `creep.memory.homeRoom === roomName` (a creep belongs to a home room even when commuting to a remote) |
| `creepsQuotas.QUOTAS` is RCL-indexed | already per-RCL; `spawnManager` looks up by the spawn's room RCL — works for N rooms |
| `creepRunner` sends non-combat creeps home from unowned rooms | already uses `spawnUtil.nearestSpawn` which is multi-room; add `creep.memory.homeRoom` so "home" is the owning room, not whichever spawn happens to be closest |
| `depositService` / `energyService` operate on `creep.room` | already room-agnostic via snapshot; no change |
| `constructionPlanner` runs per owned room | verify it iterates owned rooms via the spawnManager per-spawn loop (it should) |

### New memory

`creep.memory.homeRoom = <roomName>` assigned at spawn to
`spawn.room.name`. This is the owning room — the room whose spawn queue the
creep counts against, and the room it returns to when idle in a foreign
room.

### Files to change

| File | Change |
|---|---|
| `src/managers/spawnManager.js` | `spawnBody` writes `homeRoom: spawn.room.name` to memory; `creepCountByRole` counts by `memory.homeRoom` when `pos.roomName` differs |
| `src/managers/creepRunner.js` | `runIdleFallback` and the send-home guard use `memory.homeRoom` to find the owning spawn, not `nearestSpawn` |
| `src/utils/spawnUtil.js` | add `nearestSpawnInRoom(creep, roomName)` for explicit home-room lookup |
| `src/utils/memorySchema.js` | typed accessor for `homeRoom` |

## B. Expansion planner

**New: `src/managers/expansionPlanner.js`** — runs every
`EXPANSION_PLANNING_INTERVAL` ticks (bucket > 5000), no-op when
`Memory.flags.expansion` is falsy.

1. **Compute capacity.** `GCL - (count of owned rooms)` = available
   expansion slots. If 0, no-op.
2. **Find candidates.** For each owned room, `Game.map.describeExits` ->
   neighbors -> their neighbors (depth 2). Skip rooms that are owned by
   others, have a controller reservation by a non-ally, or are highway
   rooms.
3. **Score candidates.**

   ```
   score = sourceCount * 1000
         - distanceFromNearestOwned * 100
         - mineralTypePenalty          // avoid minerals we already mine
         - swampRatio * 200
         + hasRoomAllowFlag * 500      // rooms already whitelisted for remote
                                       // harvest are natural expansion targets
   ```

4. **Pick best.** Write `Memory.expansion.target = { roomName, score,
   plannedTick, vetoUntil }` and set a `ClaimTarget<n>` flag in-game at the
   candidate room's controller so the player can see and veto.
5. **Veto window.** `EXPANSION_VETO_TICKS` after planning, if the flag is
   removed by the player the target is canceled. Otherwise proceed to the
   claim flow.

### Files to add

| Path | Type |
|---|---|
| `src/managers/expansionPlanner.js` | new |
| `src/config/constants.js` | `EXPANSION_PLANNING_INTERVAL: 1000`, `EXPANSION_VETO_TICKS: 1000`, `EXPANSION_MIN_GCL: 2`, `EXPANSION_MIN_HOME_RCL: 4`, `EXPANSION_SEARCH_DEPTH: 2` |

## C. Claim-and-settle flow

Two new tasks and a bootstrap manager.

### New tasks

| File | Role | Body | Behavior |
|---|---|---|---|
| `src/tasks/types/taskClaim.js` | claimer | `[CLAIM, MOVE, MOVE]` | path to target controller, `claimController`, recycle on success; on failure (enemy-claimed) clear `Memory.expansion.target` and recycle |
| `src/tasks/types/taskBootstrap.js` | bootstrapper | `[WORK, CARRY, MOVE, MOVE]` (cheap, multiple) | move to new room, harvest local source, build spawn site -> extension -> road; once spawn is up and RCL >= 2, transition to normal `harvester` role and let `spawnManager` take over |

### New: `src/managers/bootstrapManager.js`

Runs every tick for rooms with `Memory.rooms[name].bootstrapping === true`.
Bucket-gated > 1000. No-op when `Memory.flags.expansion` is falsy.

- Queues construction sites for the first spawn (player places a
  `ClaimTarget` flag at the desired spawn location; the manager creates a
  `STRUCTURE_SPAWN` site at the flag position).
- Spawns bootstrappers from the **home** room with
  `memory.homeRoom = <newRoom>` and `memory.bootstrapRoom = <newRoom>`.
- Monitors the new room's RCL: once RCL >= 2 and a spawn exists, clears
  `bootstrapping`, the room joins normal per-room management.
- If the claim fails (controller already owned by enemy), cancels, logs to
  `Memory.expansion.history`, and clears `Memory.expansion.target`.

### Pipeline

```
expansionPlanner picks target
  -> player veto window (EXPANSION_VETO_TICKS)
  -> claimer spawned from home -> claims controller
  -> bootstrapManager activates for target room
  -> bootstrappers commute from home, build spawn
  -> spawn online -> RCL 2 reached -> bootstrapping cleared
  -> new room joins normal spawnManager rotation
```

### Spawn integration

- `spawnManager.tryRunForSpawn` for the **home** room spawns `claimer` and
  `bootstrapper` when `Memory.expansion.target` is active and the home room
  is healthy (storage > 30%, no active defense threat).
- The new room's own spawn comes online via `spawnManager.tick` iterating
  `Game.spawns` — no change needed once the spawn exists.
- Bootstrappers are exempt from the `creepRunner` send-home guard: they
  belong to the new room but it has no spawn yet, so "send home" would
  send them back to the home room instead of working the new room.

### Files to add / change

| Path | Type |
|---|---|
| `src/tasks/types/taskClaim.js` | new |
| `src/tasks/types/taskBootstrap.js` | new |
| `src/managers/bootstrapManager.js` | new |
| `src/tasks/tasksIndex.js` | register `claim`, `bootstrap` |
| `src/config/roles.js` | add `claimer`, `bootstrapper` roles |
| `src/config/priorities.js` | `CLAIM: 15`, `BOOTSTRAP: 45` |
| `src/economy/creepsBodies.js` | claimer + bootstrapper templates |
| `src/economy/creepsQuotas.js` | conditional claimer / bootstrapper quota when expansion active |
| `src/managers/spawnManager.js` | spawn claimer / bootstrapper from home when expansion active |
| `src/managers/creepRunner.js` | bootstrappers exempt from send-home guard (check `memory.bootstrapRoom`) |
| `src/main.js` | call `expansionPlanner.tick()` (bucket > 5000, every `EXPANSION_PLANNING_INTERVAL` ticks) and `bootstrapManager.tick()` (bucket > 1000) |
| `src/utils/memorySchema.js` | accessors for `Memory.expansion`, `Memory.rooms[name].bootstrapping`, `creep.memory.bootstrapRoom`, `creep.memory.homeRoom` |

## Memory layout

```js
Memory.expansion = {
  target: {
    roomName: "E43S28",
    score: 1850,
    plannedTick: 12000,
    vetoUntil: 13000,
  },
  history: [
    { roomName: "E43S28", claimedTick: 12050, abandonedTick: null, reason: null }
  ],
};

Memory.rooms["E43S28"] = {
  lastSeen: 12050,
  bootstrapping: true,
  homeRoom: "E42S27",      // which room spawned the bootstrappers
  claimedTick: 12050,
};

creep.memory.homeRoom      = "E42S27";   // owning room, for all creeps going forward
creep.memory.bootstrapRoom = "E43S28";   // only on bootstrappers
```

## Migration

- Bump `Memory.migrated` to **5** in `globals.js`.
- Initialize `Memory.expansion = { history: [] }`.
- `Memory.rooms[name]` gains `bootstrapping` and `homeRoom` fields (lazily
  set by `bootstrapManager`).
- Set `Memory.flags.expansion = false` if not already present.
- Existing creeps get `memory.homeRoom` back-filled to their nearest owned
  room in the one-shot migration step.

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| Claimer arrives, claim fails | Controller already claimed by enemy | `bootstrapManager` detects, clears target, recycles claimer, logs to history |
| Bootstrappers idle at source | No spawn site placed | Verify `ClaimTarget` flag exists in the target room; `bootstrapManager` creates the site from the flag position |
| New room stalls at RCL 1 | Bootstrappers dying to invaders | Spawn a fighter escort from home; fall back to clearing `Memory.expansion.target` after 3 failed bootstrappers |
| Two rooms compete for same spawn energy | `spawnManager` doesn't isolate per-room energy | Per-room spawn loop is already per-spawn; each spawn only sees its own `room.energyAvailable` — no issue |
| Expansion picks a room across a highway | Depth-2 search crosses highway | Filter highway rooms in candidate search (room name pattern + `Game.map.isRoomAvailable`) |
| Abandoned room still counted as owned | `Memory.rooms[name].bootstrapping` not cleared | `bootstrapManager` flips `bootstrapping: false` on abandon; planner decrements owned count from `Game.rooms` (live), not Memory |

## Open questions

- **Auto vs manual target selection.** v1 auto-scores but shows a flag for
  veto. Fully manual (player places flag, planner scores only that room)
  is a fallback if auto picks badly.
- **Room defense during bootstrap.** Bootstrappers are defenseless. v1
  spawns a fighter escort from home if `intelService` (from
  `plans/defense.md`) reports any hostile within 2 rooms. v2 could
  pre-clear with a full squad.
- **Bootstrap body scaling.** v1 uses a fixed cheap body. v2 could scale
  bootstrapper count to the source count and distance of the new room.
- **Abandoning a room.** If a claimed room is overrun and cannot be
  retaken, `bootstrapManager` should flip `bootstrapping: false`, log to
  `Memory.expansion.history` with the reason, and release the slot back
  to the planner.