# Defense — Squad Tactics & Observer Intel

Status: **Planned**. v1 scope: squad coordination + observer-based intel.
Boosted creeps and nuke detection are deferred to v2.

## Goal

Improve combat survivability and early threat detection with two additions:

1. **Squad coordination** — fighter+healer pairs that move and fight together
   beyond the current loose `squadLeader` pairing: formation movement, focused
   fire, and mutual retreat.
2. **Observer intel** — an observer-based service that polls surrounding rooms
   for hostile activity so defenders can spawn *before* enemies enter owned
   rooms.

## Prerequisites / gates

- RCL >= 3 for towers (already present).
- RCL >= 8 with a `STRUCTURE_OBSERVER` built for the intel service.
- `Memory.intel` and `Memory.squads` initialized (see Migration).
- Squad logic active only when `Memory.flags.squads === true`.
- Intel logic active only when `Memory.flags.intel === true`.
- Both flags default to `false`; features are opt-in.

## Squad tactics

### Current state

`spawnManager.findUnpairedFighter` pairs a healer to the newest unpaired
fighter via `creep.memory.squadLeader`. `taskHeal.run` prioritizes the leader.
`combatIdleFallback` follows the leader. There is **no** formation movement,
no coordinated target selection, and no mutual retreat — when one creep
retreats the other keeps chasing and they get split and picked off.

### New: `src/managers/squadManager.js`

Lightweight per-tick coordinator. Iterates creeps with
`creep.memory.squadId` (string, assigned at spawn). For each squad:

1. **Formation.** If leader and medic are more than `SQUAD_FORMATION_RANGE`
   tiles apart, the trailing creep moves toward the other. Extends the
   existing `combatIdleFallback` follow logic to also pull the fighter back
   toward the medic when the fighter has no current hostile target.
2. **Target sharing.** When the leader acquires a hostile target, write
   `creep.memory.squadTarget = <hostileId>` on **both** creeps. The fighter's
   `taskDefend.run` prefers this id over `findClosestByRange` so both creeps
   converge on the same enemy (focus fire). Latched for 5 ticks via
   `creep.memory.squadTargetTick` to avoid flipping between two hostiles.
3. **Mutual retreat.** If either creep drops below `SQUAD_RETREAT_HP_RATIO`
   of hits, both retreat to the nearest spawn. Currently only the damaged
   creep retreats (`taskDefend` line ~35) and the healer keeps chasing.
4. **Re-pair on loss.** When a squad's fighter dies, the medic either re-pairs
   (calls `findUnpairedFighter` again) or returns to idle patrol. When the
   medic dies, the fighter continues solo with `squadId` cleared.

### Spawn changes (`spawnManager.tryDefenders`)

- Replace the ad-hoc `desiredFighters = 2, desiredHealers = 1` with
  squad-aware logic: count **complete squads** (fighter+healer both alive and
  paired) and **incomplete** (unpaired fighter or unpaired healer).
- Maintain `desiredSquads` based on threat level:
  - 1 squad at baseline,
  - 2 when `snap.hostiles.length >= 3`,
  - 3 when a raid intel event is active (see Observer intel below).
- Spawn fighter first, then healer paired to it via the existing
  `findUnpairedFighter` mechanism. SquadManager formalizes target sharing
  and retreat coordination at runtime; spawn pairing stays as-is.
- When the `squads` flag is off, `tryDefenders` falls back to the legacy
  fixed fighter/healer counts so behavior is unchanged.

### Memory layout

```js
creep.memory.squadId    = "squad-<tick>-<spawnName>"   // assigned at spawn
creep.memory.squadRole  = "leader" | "medic"
creep.memory.squadLeader = <fighterId>                 // existing, kept for backward compat
creep.memory.squadTarget = <hostileId>                 // written by squadManager each tick
creep.memory.squadTargetTick = <Game.time>             // latch timestamp

Memory.squads = {
  "squad-12345-Spawn1": {
    leaderId: "...",
    medicId:  "...",
    formedTick: 12345,
    status: "active" | "retreating" | "broken",
  }
}
```

### Files to add / change

| File | Change |
|---|---|
| `src/managers/squadManager.js` | **NEW** — `tick()` iterates squads, sets `squadTarget`, triggers mutual retreat, re-pairs on loss |
| `src/main.js` | call `squadManager.tick()` after `creepManager.tick()` (bucket-gated > 1000); no-op when `Memory.flags.squads` is falsy |
| `src/managers/spawnManager.js` | squad-aware `tryDefenders`; assign `squadId` / `squadRole` at spawn; bump `desiredSquads` from intel raids |
| `src/tasks/types/taskDefend.js` | prefer `memory.squadTarget` over `findClosestByRange` when set and not expired; honor mutual-retreat flag |
| `src/tasks/types/taskHeal.js` | honor mutual-retreat flag (move with leader when leader is retreating) |
| `src/config/constants.js` | `SQUAD_RETREAT_HP_RATIO: 0.4`, `SQUAD_FORMATION_RANGE: 2`, `SQUAD_TARGET_LATCH_TICKS: 5`, `DESIRED_SQUADS_BASE: 1`, `DESIRED_SQUADS_RAID: 3` |
| `src/utils/memorySchema.js` | typed accessors for `squadId`, `squadRole`, `squadTarget`, `squadTargetTick` |
| `src/config/roles.js` | no change — fighter / healer roles unchanged |

## Observer intel

### New: `src/managers/upkeep/intelService.js`

Per-tick (bucket-gated > 500), for each owned room with an observer:

1. **Pick the next room to scan** from a rotating queue of
   `Game.map.describeExits` neighbors plus rooms already in `Memory.intel`
   whose `lastSeen` is oldest.
2. **Observe.** Call `observer.observeRoom(targetName)`. The scan completes
   next tick when `Game.rooms[targetName]` becomes visible — `roomManager.tick`
   already snapshots every visible room, so the snapshot itself is free.
3. **Record intel.** After the snapshot is built, write:

   ```js
   Memory.intel[roomName] = {
     lastSeen: Game.time,
     owner: controller && controller.owner && controller.owner.username,
     reservation: controller && controller.reservation && controller.reservation.username,
     hostiles: snap.hostiles.length,
     hostileStructures: snap.hostileStructures.length,
     sources: snap.sources.map(s => s.id),
   };
   ```

4. **Raid detection.** When `hostiles.length >= INTEL_RAID_HOSTILE_THRESHOLD`
   in a scanned room within linear distance 2 of any owned room, set
   `Memory.intel.raids[roomName] = { detectedTick: Game.time, threatLevel: hostiles.length }`.
   Raids decay (cleared) after `INTEL_RAID_DECAY_TICKS` with no re-detection.

### Observer queue

```js
Memory.intel.queue = ["E42S26", "E42S27", ...]   // rotating
Memory.intel.scanCursor = 0
```

One observation per observer per tick (Screeps limit). The queue is
recomputed every `INTEL_QUEUE_REFRESH_TICKS` or when an owned room's exits
change (room added/lost via expansion or abandonment).

### Spawn trigger

`spawnManager.tryRunForSpawn` reads `Memory.intel.raids` and bumps
`desiredSquads` to `DESIRED_SQUADS_RAID` (3) while any raid event is active.
This is the early-warning trigger — defenders spawn *before* the enemy
arrives in the owned room.

### Files to add / change

| File | Change |
|---|---|
| `src/managers/upkeep/intelService.js` | **NEW** — observer rotation, intel writes, raid detection + decay |
| `src/managers/upkeepManager.js` | register `intelService.tick()`; no-op when `Memory.flags.intel` is falsy |
| `src/managers/roomManager.js` | no change (already snapshots all visible rooms) |
| `src/managers/spawnManager.js` | read `Memory.intel.raids` to scale `desiredSquads` |
| `src/config/constants.js` | `INTEL_SCAN_INTERVAL: 1`, `INTEL_RAID_DECAY_TICKS: 1000`, `INTEL_RAID_HOSTILE_THRESHOLD: 3`, `INTEL_RAID_NEARBY_DISTANCE: 2`, `INTEL_QUEUE_REFRESH_TICKS: 1000` |
| `src/utils/memorySchema.js` | typed accessors for `Memory.intel`, `Memory.intel.raids` |

## Migration

- Bump `Memory.migrated` to **3** in `globals.js`.
- Initialize `Memory.intel = { queue: [], scanCursor: 0, raids: {} }` and
  `Memory.squads = {}`.
- Set `Memory.flags.squads = false` and `Memory.flags.intel = false` if not
  already present (so the features are explicitly opt-in).
- Existing `squadLeader` memory on live healers is preserved.
  `squadManager.tick` back-fills `squadId` / `squadRole` for any paired
  fighter/healer lacking them, so a heal currently in flight keeps working.

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| Healer charges ahead of fighter | `squadManager` not running | Check `Memory.flags.squads` and the bucket gate |
| Squad stuck oscillating between two hostiles | `squadTarget` flips every tick | Latch via `squadTargetTick` for `SQUAD_TARGET_LATCH_TICKS` |
| Observer never scans | Queue empty or no observer | Verify RCL >= 8, observer built, `Memory.intel.queue` populated |
| Raid flag never clears | Decay check missing | `intelService.tick` decrements raids each scan |
| Defender count spikes permanently | Raid never decays | Same as above; verify `INTEL_RAID_DECAY_TICKS` |

## Open questions (v2)

- **Squad size > 2.** v1 is pairs only. v2 could add a ranged-only third
  member (`squadRole: "ranger"`) for kiting squads.
- **Observer defense.** Observers have no combat ability; if an enemy
  approaches the observer's room the observer itself is a target. Intel
  service should flag observer-room threats at higher priority.
- **Boosted creeps.** Detect lab availability and spawn boosted bodies for
  tough invaders / player attacks. Deferred.
- **Nuke detection.** `Game.rooms` exposes `FIND_NUKES`; add a
  `nukeService` that triggers safe mode + evacuation. Deferred.