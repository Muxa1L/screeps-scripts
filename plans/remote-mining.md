# Remote Mining — Implementation Plan

Status: **Implemented** (commit 59dafbb, reviewed and fixed in 481e667). Refines the original design into a concrete, file-level
implementation plan. v1 is manually triggered via in-game `RemoteTarget<n>`
flags; auto-discovery is deferred to v2.

## Goal

Extend the in-room task-queue system so that one or more remote rooms can be
reserved, defended, and mined. All code slots into the existing `tasks/` and
`managers/` folders without structural changes to the snapshot or scheduler.

## Prerequisites (gates)

Before the remote-mining pipeline activates, the home room must satisfy
**all** of the following:

1. `room.controller.level >= 4` (extensions enough to support extra creeps).
2. At least one `STRUCTURE_OBSERVER` in the home room (used for intel,
   shared with `plans/defense.md`).
3. At least 2 sources in the home room are claimed by miners with positive
   throughput (no point splitting energy if the home room is starved).
4. `Memory.remoteRooms` is non-empty (set by a planner or manually via a
   `RemoteTarget<n>` flag).
5. `Memory.flags.remoteMining === true` (feature flag, off by default).

If any gate fails, the remote-mining pipeline is a no-op and existing
behavior is preserved.

## Concrete file additions

### New task handlers (under `src/tasks/types/`)

| File | Role | Body (RCL 4) | Behavior summary |
|---|---|---|---|
| `taskScout.js` | scout | `[MOVE]` | path to target room, set `Memory.remoteRooms[name].scoutedTick = Game.time`, register sources via `sourceRegistry.registerRemoteSource`, recycle on arrival |
| `taskReserve.js` | reserver | `[CLAIM, MOVE, MOVE]` | path to controller, `reserveController` until timer >= 1500, hold; release and re-task if enemy-reserved |
| `taskRemoteMine.js` | remoteMiner | same as `taskMine` body | claim remote source slot, mine, drop into adjacent container (or `drop` on the ground if no container yet) |
| `taskRemoteHaul.js` | remoteHauler | `[CARRY*16, MOVE*8]` (1600 energy) | withdraw from remote container, return to home, deposit via `depositService` |
| `taskRemoteBuild.js` | remoteBuilder | `[WORK, CARRY, CARRY, MOVE, MOVE, MOVE]` | travel to remote room, build queued sites (container first, then road), recycle when done |
| `taskRemoteDefend.js` | fighter / healer (existing roles) | existing combat bodies | spawned reactively on threat; uses squad coordination from `plans/defense.md` |

### Registry / role changes

| File | Change |
|---|---|
| `src/tasks/tasksIndex.js` | register `scout`, `reserve`, `remoteMine`, `remoteHaul`, `remoteBuild`, `remoteDefend` |
| `src/config/roles.js` | add `scout`, `reserver`, `remoteMiner`, `remoteHauler`, `remoteBuilder` with `allowed` arrays |
| `src/config/priorities.js` | add `SCOUT: 88`, `RESERVE: 87`, `REMOTE_MINE: 82`, `REMOTE_HAUL: 52`, `REMOTE_BUILD: 62`, `REMOTE_DEFEND: 12` |

### Source registry extension (`src/economy/sourceRegistry.js`)

- Add `reachable: true|false` to each slot, computed by checking a path from
  the room exit to the slot tile. Cached, recomputed every 500 ticks alongside
  the existing `recomputeSlots` pass.
- Add `registerRemoteSource(room, source)` — called by `taskScout` when it
  arrives in a remote room. Populates `Memory.sources[id]` with `roomName`,
  `x`, `y`, `slots`, `reachable`.
- Existing `claimSlot` / `releaseClaim` work unchanged for remote sources
  (they already iterate all `Memory.sources`).

### Spawn changes (`src/managers/spawnManager.js`)

- Add `creepsBodies` templates for each remote role.
- Extend `creepsQuotas.QUOTAS` with remote-role counts gated on
  `Memory.remoteRooms` having an active entry:

  ```js
  // Added by dynamicQuota when remoteRooms active:
  scout:         1   // per unscouted target
  reserver:      1   // per reserved room
  remoteMiner:   1   // per active remote source
  remoteHauler:  2   // per active remote room (distance-dependent)
  remoteBuilder: 1   // while constructionPlan active
  ```

- `nextRoleToSpawn` checks remote pipeline state and interleaves remote
  roles with economy roles. Remote roles are spawned from the home room's
  spawn only (single-home-room assumption for v1).

### creepManager / creepRunner changes

| File | Change |
|---|---|
| `src/managers/creepRunner.js` | creeps with `memory.remoteRoom` resolve their snapshot from `roomManager.get(memory.remoteRoom)` instead of `creep.room` when picking tasks; the "send non-combat creeps home from unowned rooms" guard is extended to also exempt `memory.remoteRoom`-tagged creeps (in addition to the existing `room_allow:` exemption) |
| `src/managers/creepManager.js` | no structural change — `collectCombatTasks` already iterates all visible rooms |

### Route caching

| File | Change |
|---|---|
| `src/utils/routeCache.js` | **NEW** — `getRoute(from, to)` caches `Game.map.findRoute` result on `Memory.remoteRooms[to].route` with a 1000-tick TTL; `getNextStep(from, to, currentRoom)` returns the next exit toward the destination |
| `src/tasks/types/taskRemoteHaul.js` | uses `routeCache.getNextStep` for cross-room movement instead of raw `moveCreep` to an absolute target — avoids recomputing the path on every tile |
| `src/tasks/types/taskScout.js`, `taskRemoteBuild.js` | same `routeCache` usage for cross-room travel |

### Pipeline state machine — `src/managers/remoteManager.js`

**NEW.** Runs per tick (bucket > 1500), no-op when
`Memory.flags.remoteMining` is falsy. Advances state per remote room:

```
flag placed -> scout dispatched       (status: "pending")
  -> scout arrives                    (status: "scouted")
  -> reserver dispatched              (status: "reserving")
  -> reservation held                 (status: "reserved")
  -> container site queued + remoteBuilder dispatched  (status: "building")
  -> container built                  (status: "active")
  -> remoteMiner + remoteHauler dispatched
  -> (hostile detected)               (status: "contested" -> spawn remoteDefend)
  -> (threat cleared for 100 ticks)   (status: "active")
  -> (reservation lapses + no threat for 2000 ticks)   (status: "abandoned")
```

Transitions driven by reading `Memory.remoteRooms[name]` and the live
snapshot:

- if `status === 'pending'` and a `RemoteTarget` flag exists for the room
  -> spawn scout from home.
- if `scouted` and not reserved -> spawn reserver.
- if `reserved` and no container -> queue container site via
  `constructionPlanner` and spawn remoteBuilder.
- if container built -> spawn remoteMiner + remoteHauler.
- if hostiles in snapshot and no defender -> spawn remoteDefend, set
  `contested`.
- if `contested` and no hostiles for 100 ticks -> `active`.
- if `reserved`/`active` and reservation lapsed + no threats for 2000 ticks
  -> `abandoned` (flag for cleanup; memory entry may be deleted).

### Threat gating

`taskRemoteDefend` is spawned only if:

- A non-owner creep is visible in the remote room, **or**
- The last-known intel (`Memory.remoteRooms[name].lastIntel`) is older than
  5000 ticks AND the room is reserved by us.

If a threat is detected but the home room cannot afford a defender pair
(`Game.cpu.bucket < 5000` or insufficient energy), the remote miners and
haulers retreat. The reservation is allowed to lapse — losing a remote room
is cheaper than losing the home room.

### Economic thresholds

- Only attempt to mine a remote room if the round-trip distance is **< 30
  tiles** (1 CARRY pays for itself in ~15 tiles round trip).
- Skip a remote source if the home room is below 50% storage capacity.
- Cap at 2 active remote rooms per home room initially. Increase once
  `controller.level >= 7` and GCL permits.

## Memory layout

```js
Memory.remoteRooms = {
  "E42S27": {
    target: "E42S27",
    status: "pending" | "scouted" | "reserving" | "reserved" | "building" | "active" | "contested" | "abandoned",
    scoutedTick: 12345,
    reservationExpires: 13000,
    sourceIds: ["..."],
    containerSiteIds: ["..."],
    containerIds: ["..."],
    route: [{ exit: "E42S26", dir: FIND_EXIT_RIGHT }, ...],
    routeComputedTick: 12345,
    lastIntel: 12500,
    threats: [],   // [{ creepId, hits, type, detectedTick }]
  }
};
```

`Memory.remoteRooms` is keyed by room name. `Memory.flags.remoteMining`
gates the whole pipeline.

## Migration

- Bump `Memory.migrated` to **4** in `globals.js`.
- Initialize `Memory.remoteRooms = {}`.
- Set `Memory.flags.remoteMining = false` if not already present.
- No back-fill needed for live creeps — remote roles are new and only
  spawned after the flag is on.

## Files to add / change summary

| Path | Type |
|---|---|
| `src/tasks/types/taskScout.js` | new |
| `src/tasks/types/taskReserve.js` | new |
| `src/tasks/types/taskRemoteMine.js` | new |
| `src/tasks/types/taskRemoteHaul.js` | new |
| `src/tasks/types/taskRemoteBuild.js` | new |
| `src/tasks/types/taskRemoteDefend.js` | new |
| `src/managers/remoteManager.js` | new (pipeline state machine) |
| `src/utils/routeCache.js` | new |
| `src/tasks/tasksIndex.js` | register 6 new task types |
| `src/config/roles.js` | add 5 new roles |
| `src/config/priorities.js` | add 6 new priorities |
| `src/config/constants.js` | remote thresholds (`REMOTE_MAX_DISTANCE: 30`, `REMOTE_MIN_STORAGE_RATIO: 0.5`, `REMOTE_MAX_ROOMS: 2`, `REMOTE_THREAT_STALE_TICKS: 5000`, `REMOTE_ABANDON_TICKS: 2000`) |
| `src/economy/sourceRegistry.js` | `registerRemoteSource`, `reachable` flag on slots |
| `src/economy/creepsBodies.js` | remote role body templates |
| `src/economy/creepsQuotas.js` | remote role quotas (conditional on `Memory.remoteRooms`) |
| `src/managers/spawnManager.js` | remote role spawning, gate on prerequisites |
| `src/managers/creepRunner.js` | `memory.remoteRoom` snapshot resolution; exempt from send-home guard |
| `src/managers/roomManager.js` | no change (already snapshots all visible rooms) |
| `src/main.js` | call `remoteManager.tick()` (bucket > 1500) |
| `src/utils/memorySchema.js` | accessors for `Memory.remoteRooms`, `creep.memory.remoteRoom` |

## Failure modes & recovery

| Symptom | Likely cause | Action |
|---|---|---|
| Reservation timer keeps resetting | No respawned reserver | Spawn a reserver from `spawnManager` priority queue |
| Hauler idle at exit | Route cache stale | Recompute route (`routeCache.getRoute(... , { force: true })`), clear hauler memory |
| Container never fills | No miner or wrong slot | Verify `Memory.sources[id]` and miner `memory.sourceId` |
| Defender keeps dying | Insufficient heals | Healer body must be paired with each fighter (squad from `plans/defense.md`) |
| Status stuck at `pending` | No `RemoteTarget` flag placed | Player places flag, or planner (v2) auto-picks |

## Open questions

- **Scout policy.** v1: manual flag (`RemoteTarget1`, `RemoteTarget2`, ...).
  v2: auto-discovery of the closest unowned/neutral room.
- **Observer-driven intel vs. room-visibility.** v1 relies on the hauler
  naturally seeing the room every trip plus the `intelService` from
  `plans/defense.md`. Observer polling of remote rooms is added in v2.
- **Multiple home rooms.** Out of scope for v1; assumes single home room.
  See `plans/multi-room.md` for the multi-home-room generalization.
- **Reserving vs. claiming.** v1 uses reserve (cheaper, sufficient for
  non-owned rooms we just want to mine). Claim is part of the multi-room
  expansion pipeline, not remote mining.