# Remote Mining — Design Document

Status: **Deferred** (no implementation in the current overhaul). This document captures the design so future work can pick it up cleanly.

## Goal

Extend the in-room task-queue system so that one or more remote rooms can be claimed, defended, and mined. All code should slot into the existing `tasks/` and `managers/` folders without structural changes.

## Prerequisites (gates)

Before remote mining activates, the home room must satisfy **all** of the following:

1. `room.controller.level >= 4` (extensions enough to support extra creeps).
2. At least one `STRUCTURE_OBSERVER` in the home room (used for intel).
3. At least 2 sources in the home room are claimed by miners with positive throughput (no point splitting energy if the home room is starved).
4. `Memory.remoteRooms` is non-empty (set by a planner or manually).

If any gate fails, the remote-mining pipeline is a no-op and existing behavior is preserved.

## High-level pipeline

```
[Scout] -> [Reserve target room] -> [Build container + road] -> [Mine + Haul]
                                          |
                                          v
                                  [Defend if hostile]
```

Each stage is a separate `tasks/task.*.js` handler invoked by `creepManager` like any other task. The `taskRegistry` only emits remote tasks when the prerequisites are met.

## New tasks

### `task.reserve`

- Body: `[CLAIM, MOVE, MOVE]` (1 claim part, 2 move for 1-tile-per-tick travel).
- Behavior: pathfind to the target room's controller; if the controller is unowned and not reserved by an ally, call `reserveController`. If already reserved by us and the timer is < 1500, hold position and renew. Release and re-task if reserved by ally/enemy.
- Lifetime target: keep reserved continuously so the room does not become neutral.

### `task.scout`

- Body: `[MOVE]` (or `[MOVE, MOVE]`).
- Behavior: move to the room, call `room.observe` is not a thing — instead, return the snapshot from `roomManager` (which already builds it via `Game.rooms[name]`). The scout's job is to **arrive** and mark the room as "scouted" in `Memory.remoteRooms[roomName].scouted = true`.
- After scouting, the scout switches to defender duty and is recycled.

### `task.remoteMine`

- Body: same as in-room miner (`MINER_BODIES[capacity]`) — WORK-only, drop-mine into a container.
- Pre-reqs: a `STRUCTURE_CONTAINER` must be built adjacent to the source. The build itself is a `task.build` issued by a builder.
- Behavior: claim a source slot via `sourceRegistry`, mine until full, drop into container. No carry, no travel.

### `task.remoteHaul`

- Body: large CARRY/MOVE optimized for the route length. e.g. `[CARRY×16, MOVE×8]` (1600 energy).
- Behavior: travel to the remote container, withdraw energy, return to home room, transfer to spawn/extension/tower. Drop-and-go is acceptable if home extensions are full (drop in a home-room container).

### `task.remoteBuild`

- Body: `[WORK, CARRY, CARRY, MOVE, MOVE, MOVE]`.
- Pre-reqs: `Memory.remoteRooms[roomName].constructionPlan` set.
- Behavior: travel to the room, build the queued construction sites (container first, then road), recycle when done.

### `task.remoteDefend`

- Body: same as in-room fighter + healer.
- Trigger: any hostile in the remote room. Spawned in response, not pre-planned.

## Memory layout

```js
Memory.remoteRooms = {
    "W2N3": {
        target: "W2N3",
        status: "scouted" | "reserved" | "active" | "contested",
        scouted: Game.time,
        reservationExpires: Game.time,
        containerSiteId: "...",          // optional, while being built
        lastIntel: Game.time,
        threats: [],                     // [{ creep, hits, type }]
    },
    "W3N4": { ... }
};
```

`Memory.remoteRooms` is keyed by room name. Status transitions:

```
empty -> scouted -> reserved -> active
                              \-> contested -> active (after threat cleared)
```

## Source registry: extensions

Currently `sourceRegistry` only knows about in-room sources. Extend it so it can also register remote source slots:

- `Memory.sources[sourceId].roomName` already tells us the room. The miner task already uses it.
- The only addition needed: ensure the slot is on a tile that is **walkable from the room exit**, otherwise the hauler can't reach the container. Compute this once at registration time and store `Memory.sources[sourceId].reachable = true|false`.

## Hauler routing

The single largest CPU cost in remote mining is hauler pathfinding. Mitigations:

- Use `Game.map.findRoute(homeRoom, remoteRoom)` once and cache on `Memory.remoteRooms[roomName].route`. Recompute every 1000 ticks.
- Reuse the existing `pathCache` for movement, keyed `roomName:startPos:goalId`.
- Haulers always move toward the **next step** in the cached route, not the absolute target — this avoids recomputing on every tile.

## Threat gating

`task.remoteDefend` is spawned only if:

- A non-owner creep is visible in the remote room, **or**
- The last-known intel (`Memory.remoteRooms[name].lastIntel`) is older than 5000 ticks AND the room is reserved by us.

If a threat is detected but the home room cannot afford a defender pair (`Game.cpu.bucket < 5000` or insufficient energy), the remote miners and haulers retreat. The reservation is allowed to lapse — losing a remote room is cheaper than losing the home room.

## Economic thresholds

- Only attempt to mine a remote room if the round-trip distance is **< 30 tiles** (rough rule of thumb: 1 CARRY pays for itself in ~15 tiles round trip).
- Skip a remote source if the home room is below 50% storage capacity — it can wait.
- Cap at 2 active remote rooms per home room initially. Increase once `controller.level >= 7` and GCL permits.

## Failure modes & recovery

| Symptom                              | Likely cause             | Action |
|--------------------------------------|--------------------------|--------|
| Reservation timer keeps resetting    | No respawned reserver    | Spawn a reserver from `spawnManager` priority queue |
| Hauler idle at exit                  | Route cache stale        | Recompute route, clear hauler memory |
| Container never fills                | No miner or wrong slot   | Verify `Memory.sources[id]` and miner `memory.sourceId` |
| Defender keeps dying                 | Insufficient heals       | Healer body must be paired with each fighter |

## Migration path

1. Add `Memory.remoteRooms = {}` initialization in `globals.js` (next to the `migrated` flag).
2. Add new task handlers under `tasks/task.reserve.js`, `task.scout.js`, `task.remoteMine.js`, `task.remoteHaul.js`, `task.remoteBuild.js`, `task.remoteDefend.js`.
3. Extend `taskRegistry` with a `remoteList(room)` that returns remote-room tasks for creeps flagged with `creep.memory.remoteRoom`.
4. Extend `creepManager` so creeps with `memory.remoteRoom` resolve tasks against that room's snapshot, not `creep.room`.
5. Extend `sourceRegistry` with the `reachable` flag and the per-room slot pool.
6. Add a `remoteHaulBody` and `remoteMinerBody` selector to `spawnManager.js` and gate on the prerequisites.

No changes are needed to `main.js`, `roomManager`, or `pathCache`.

## Open questions

- **Scout policy:** manual (player drops a flag) vs. automatic (AI picks the closest unowned/neutral room). Recommend manual flag `RemoteTarget1` for v1; auto-discovery in v2.
- **Observer-driven intel vs. room-visibility:** observability vs. cost. For v1, rely on the hauler naturally seeing the room every trip. Add observer polling in v2.
- **Multiple home rooms:** out of scope; assumes single home room for v1.
- **Reserving vs. claiming:** claim requires 1 claim part + 1500 energy at the controller. Reserve is cheaper and sufficient for non-owned rooms we just want to mine. v1 uses reserve.
