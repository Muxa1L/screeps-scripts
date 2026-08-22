# Nuke Detection — Evacuation & Safe-Mode

Status: **Implemented** (v1 detection + safe-mode trigger live in
`src/managers/upkeep/nukeService.js`, wired via upkeepManager).
Evacuation (cross-room creep retreat) is deferred until a second owned
room exists. v1 scope shipped: detect incoming nukes via `FIND_NUKES`,
trigger safe mode automatically when `timeToLand` is low.

## Goal

A launched nuke destroys all structures in a 5x5 area in 50,000 ticks
or when the launch lands. Without a `safe mode` triggered before
landing, the room loses the spawn and a 5-tile area of buildings.
This plan ships:

1. **Detection** — find nukes in each owned room.
2. **Safe mode trigger** — when `timeToLand < NUKE_SAFE_MODE_TICKS`,
   activate safe mode if available.
3. **Evacuation** — non-combat creeps in the threatened room walk
   out (cross-room, to a designated fallback room) before the
   nuke lands. Boosters/harvesters return after landing.
4. **Defense response** — when a nuke is detected, bump defender
   count so the launcher's reservation is contested by us.

## Prerequisites / gates

- RCL >= 1 (any room can be nuke-targeted; no RCL gate).
- `Memory.flags.nukeDefense === true` (off by default).
- `Memory.nuke` initialized (see Migration).

## A. Nuke model

A nuke is a `FIND_NUKES` object with:
- `pos` — the landing position (5x5 area centered here).
- `room` — the room the nuke will land in.
- `timeToLand` — ticks until impact (50,000 = launched, decreasing).
- `launchRoomName` — the launching player's room.
- `structureType === STRUCTURE_NUKER` for the launching structure.

The 5x5 area is `[pos.x-2..pos.x+2, pos.y-2..pos.y+2]`.

## B. New: `src/managers/upkeep/nukeService.js`

Per-tick (bucket > 1000), for each owned room:

1. **Detect.** `room.find(FIND_NUKES)`.
2. **Filter by `timeToLand`.** Drop nukes with `timeToLand > NUKE_SAFE_MODE_TICKS` (default 5000).
3. **Trigger safe mode.** If `controller.safeModeAvailable > 0` and
   `controller.safeModeCooldown === 0` and the nuke lands within
   `NUKE_SAFE_MODE_TICKS`:
   - `controller.activateSafeMode()`.
   - Log `[nuke] safe mode activated in <room> for nuke @<pos> timeToLand=<N>`.
   - Write `Memory.nuke.events[roomName] = { tick, pos, timeToLand, safeModeActivated: true }`.
4. **Evacuate creeps.** Set a `Memory.nuke.evacuating[roomName] = true` flag.
   This is read by `creepRunner.runCreep` to route non-combat creeps to a
   fallback room (a sibling owned room if one exists, else the
   nearest room that is on the `room_allow:` whitelist, else the
   nearest owned room). The evacuation flag is cleared when the
   nuke lands (`timeToLand === 0`).
5. **Spawn defenders.** Bump `desiredSquads` to `DESIRED_SQUADS_NUKE`
   (default 3) so the launcher is contested.

## C. Evacuation mechanics

`creepRunner.runCreep` is extended with a new branch **before** the
foreign-room guard:

```js
const nuke = memory.getNukeEvac(roomName);
if (nuke && role !== 'fighter' && role !== 'healer') {
    // Path to the fallback room
    const fallback = nearestOwnedRoomExcept(roomName);
    if (fallback) {
        const spawn = spawnUtil.nearestSpawnInRoom(creep, fallback);
        if (spawn) move.moveCreep(creep, spawn, { visualizePathStyle: { stroke: '#ff8800' } });
    }
    return;
}
```

The fallback room is the **closest other owned room** by
`Game.map.getRoomLinearDistance`. If there's only one owned room, the
creep walks to the room's **opposite corner** (out of the 5x5
landing area) and stays there.

The creep's task is released (`runCreep` returns without selecting a
task) but the creep is not deleted. After the nuke lands (cleared
on the next `nukeService.tick` invocation), the creep re-evaluates
and re-takes its usual task.

## D. Safe mode timing

A nuke is destroyed by safe mode IF safe mode is active at the
moment the nuke lands. Safe mode lasts 20,000 ticks. A nuke takes
50,000 ticks to land from launch, so:

- Launch at t=0, nukeTimeToLand=50,000
- Activate safe mode at t=45,000 (timeToLand=5,000)
- Nuke lands at t=50,000 — safe mode has 20,000 left
- Safe mode destroys the nuke

If safe mode is on cooldown (used recently), the alternative is to
evacuate the room and let the nuke destroy un-defended structures.
The plan only triggers safe mode when it's available and not on
cooldown.

## E. Files to add / change

| Path | Type |
|---|---|
| `src/managers/upkeep/nukeService.js` | new — detection + safe mode + evac |
| `src/managers/upkeepManager.js` | register `nukeService.tick()` |
| `src/managers/creepRunner.js` | add `nukeEvac` branch to `runCreep` |
| `src/managers/roomManager.js` | snapshot `nukes: room.find(FIND_NUKES)` |
| `src/managers/spawnManager.js` | bump `desiredSquads` when `Memory.nuke.events[room]` is set |
| `src/config/constants.js` | `NUKE_SAFE_MODE_TICKS: 5000`, `DESIRED_SQUADS_NUKE: 3`, `NUKE_EVAC_RADIUS: 2` |
| `src/utils/memorySchema.js` | `getNukeEvac(roomName)`, `setNukeEvac`, `clearNukeEvac` |
| `tests/mocks/screeps.js` | add `FIND_NUKES`, `STRUCTURE_NUKER`, mock nuke object with `timeToLand` |

## F. Memory layout

```js
Memory.nuke = {
  events: {
    [roomName]: {
      detectedTick: <Game.time>,
      pos: { x, y },
      timeToLand: <number>,
      safeModeActivated: <bool>,
      launchRoomName: <string>,
    },
  },
  evacuating: {
    [roomName]: true,  // set by nukeService, cleared when timeToLand hits 0
  },
  stat: {
    nukesDetected: 0,
    safeModeTriggered: 0,
    roomsEvacuated: 0,
  },
};
```

## G. Migration

- Bump `Memory.migrated` to **9** in `globals.js`.
- Initialize `Memory.nuke = { events: {}, evacuating: {}, stat: {...} }`.
- Set `Memory.flags.nukeDefense = false` if not already.

## H. Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| Safe mode didn't trigger | On cooldown from prior | Evacuate-only; log "safe mode on cooldown" |
| Evacuation creep walked wrong way | No fallback room | Walk to opposite corner of own room |
| Defender count spiked but no fight | Launcher not in observer queue | `squadManager` falls through to idle patrol |
| Nuke evaded the wrong room | Wrong `pos.roomName` (launcher in adjacent room) | Filter by `nuke.room.name === roomName`, not by `pos` |
| Memory growth | `Memory.nuke.events` never cleared | Clear entries `> 1000` ticks old each tick |

## I. Open questions (v2)

- **Multi-room nuke detection.** v1 looks per room. A nuke in transit
  isn't visible until it lands. v2 could intercept via observer
  scan of launcher rooms.
- **Counter-nuke.** The AI has no offensive nuke capability; that's
  player-driven. Future: a "deny launch" squad to destroy the
  attacker's `STRUCTURE_NUKER`.
- **Shield ramparts.** A nuke ignores rampart hits. Pre-nuke
  walls/ramparts are wasted. v2 might de-prioritize building
  ramparts when a nuke is detected (to save CPU/energy for
  rebuilding after).
- **Shard-wide alert.** When one room is nuked, other rooms on the
  same shard should know. v2 broadcasts via `Memory.nuke.shardAlert`.
