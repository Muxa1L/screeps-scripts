# Auto-Discovery — Remote Room Target Selection

Status: **Implemented** (`src/managers/remoteDiscovery.js`, wired in
`main.js`). BFS depth-2 scan, scoring `sources*1000 - dist*100`,
dedup vs expansion targets, veto window, auto-discovery cap, gated on
`Memory.flags.remoteMining` + `remotePrerequisitesMet()` (RCL4+,
observer, 2 claimed home sources).

## Goal

Replace manual flag placement with a scoring-based auto-discovery. The
discoverer:

1. Walks the neighbor graph of every owned room up to depth 2.
2. Skips already-claimed, abandoned, and highway rooms (mirrors
   `expansionPlanner.findCandidates`).
3. Scores by `sourceCount * 1000 - distance * 100 - swampRatio * 200`.
4. Picks the top N candidates where N = `REMOTE_AUTO_DISCOVERY_CAP`
   (default 2 per home room, configurable).
5. Writes `Memory.remoteRooms[candidate] = { status: 'pending', auto: true }`.
6. Optionally plants a `RemoteTarget<n>` flag at the candidate room's
   center for the player's veto.

The existing `remoteManager.tick` then runs the pipeline.

## A. New: `src/managers/remoteDiscovery.js`

Runs every `REMOTE_DISCOVERY_INTERVAL` ticks (default 5000), gated on
`Memory.flags.remoteMining` and the existing
`creepsQuotas.remotePrerequisitesMet()` gate (RCL >= 4, observer
present, >= 2 home sources claimed, etc.).

```js
function tick() {
    if (Game.time % INTERVAL !== 0) return;
    if (!Memory.flags || !Memory.flags.remoteMining) return;
    if (!remotePrerequisitesMet()) return;
    const candidates = findCandidates();   // mirrors expansionPlanner logic
    if (candidates.length === 0) return;
    const best = pickBest(candidates);
    if (!best) return;
    ensureRemoteRoom(best);
    // Plant a flag for veto; player can remove to skip
    plantFlag(best);
}

function ensureRemoteRoom(roomName) {
    const rr = memory.ensureRemoteRooms();
    if (rr[roomName]) return;
    rr[roomName] = {
        target: roomName,
        status: 'pending',
        scoutedTick: 0,
        reservationExpires: 0,
        sourceIds: [],
        containerSiteIds: [],
        containerIds: [],
        roadSiteIds: [],
        threats: [],
        homeRoom: homeRoomForRemote(roomName),
        autoDiscovered: true,
        discoveredTick: Game.time,
    };
}
```

## B. Conflict with `expansionPlanner`

`expansionPlanner.findCandidates` and the new
`remoteDiscovery.findCandidates` walk the same neighbor graph. The
two could disagree about which rooms are valid. v2 deduplicates:
`expansionPlanner` skips rooms already in `Memory.remoteRooms` as
active remote targets, and `remoteDiscovery` skips rooms in
`expansionPlanner.target`.

```js
// in remoteDiscovery.findCandidates
if (alreadyRemoteTarget(name)) continue;
if (memory.getExpansion().target &&
    memory.getExpansion().target.roomName === name) continue;
```

## C. Configuration

| Constant | Default | Description |
|---|---|---|
| `REMOTE_DISCOVERY_INTERVAL` | 5000 | Recompute interval (ticks) |
| `REMOTE_AUTO_DISCOVERY_CAP` | 2 | Max candidates per home room |
| `REMOTE_AUTO_MIN_DISTANCE` | 1 | Skip rooms < 1 hop from home (use expansion instead) |
| `REMOTE_AUTO_VETO_TICKS` | 1000 | Player veto window before scout dispatch |

## D. Files to add / change

| Path | Type |
|---|---|
| `src/managers/remoteDiscovery.js` | new |
| `src/managers/expansionPlanner.js` | skip rooms in `Memory.remoteRooms` (with active status) as candidates |
| `src/managers/remoteManager.js` | already supports `autoDiscovered` flag (no change) |
| `src/config/constants.js` | add the constants above |
| `src/main.js` | call `remoteDiscovery.tick()` (bucket > 5000, every `REMOTE_DISCOVERY_INTERVAL` ticks) |
| `src/utils/memorySchema.js` | `getRemoteRooms` accessor exists; add `autoDiscovered` handling |

## E. Memory layout (delta only)

```js
Memory.remoteRooms[roomName] = {
    // ...existing fields...
    autoDiscovered: true,        // new
    discoveredTick: 12345,       // new (vs `scoutedTick` which is the scout's arrival tick)
    vetoUntil: 13345,            // new (auto-discovery's veto window; player can remove flag to cancel)
};
```

## F. Test plan (`tests/managers/remoteDiscovery.test.js`)

```js
test('discovers neighbors when no remoteRooms are active', () => {
    Memory.flags = { remoteMining: true };
    // Mock Game.rooms with one owned room + 2 neighbors
    // ...
    remoteDiscovery.tick();
    assert.ok(Memory.remoteRooms['E1N1'] || Memory.remoteRooms['W1N1']);
});

test('skips rooms already in active remoteRooms', () => {
    Memory.remoteRooms = { 'E1N1': { status: 'active' } };
    remoteDiscovery.tick();
    // E1N1 should not be re-added
});

test('skips rooms in expansionPlanner.target', () => {
    Memory.expansion = { target: { roomName: 'E1N1' } };
    remoteDiscovery.tick();
    // E1N1 should not be added
});

test('skips rooms without sufficient distance from home', () => {
    // Mock a neighbor at distance 0 (same room) - should be skipped
});

test('does not discover when remotePrerequisitesMet() returns false', () => {
    // Mock a home room at RCL 3
    remoteDiscovery.tick();
    assert.equal(Object.keys(Memory.remoteRooms).length, 0);
});
```

## G. Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| No candidates | All neighbors are claimed / highways | Wait; check after expansion; log `[remote] no candidates` |
| Conflict with `expansionPlanner` | Both pick the same room | Deduplication in both directions |
| Auto-discovery picks a high-threat room | Swamp ratio not in score | Add a threat penalty from `Memory.intel.rooms[name]` |
| Player keeps removing flags | Annoying | Add a `REMOTE_AUTO_SKIP` flag that disables auto-discovery |

## H. Open questions (v2)

- **Reserving vs. claiming priority.** v1 reserves. v2 might claim
  the highest-scoring candidate and reserve the next.
- **Distance-aware scoring.** Add `path` distance (route length)
  instead of `linear` distance for a more accurate commute cost.
- **Per-room quota.** With 2 home rooms, each gets 2 candidates. v2
  could weight by storage ratio (richer room gets more remotes).
- **Throttle per shard.** Multi-shard would re-discover on every
  shard; cache by shard.
