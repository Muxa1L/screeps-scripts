# Highway Mining — Source Rooms in SK / Center

Status: **Planned**. Highway rooms (SK and center) have no controller
but can have up to 4 sources in the center of the map. v2 scope:
detect center rooms, treat them as remote mining targets, and add a
highway-specific hauler that hoards to a 4-container pattern.

## Goal

Center rooms (`W0N0`, `E0S0`, etc.) have no controller, no reservation
needed, and no one else can claim them. The 4 sources (4,500
energy each per regen cycle) are pure profit. The catch:

- 50-tile walks (highways surround the center; no exit shortcuts).
- Center rooms are visible only via observer (or by walking through).
- Hostile players can also mine center sources.

v2 ships a separate pipeline that:

1. Detects center rooms via `Game.map.describeExits` (highway
   rooms have a 4-direction neighbor graph).
2. Mines aggressively with 1 miner per source.
3. Hauls the energy to the nearest owned room's storage via a
   dedicated `highwayHauler` role.

## A. Detection

`src/managers/centerScan.js` (new) — runs every `CENTER_SCAN_INTERVAL`
ticks (default 5000) for each owned room with an observer.

1. Build a list of "candidate center rooms" by walking the
   `Game.map.describeExits` graph and identifying rooms where
   `isHighway(neighbor)` and `getRoomLinearDistance(neighbor, 'E0N0') < 5`.
2. Plant an observer flag (or use the existing observer queue) to
   scan the closest.
3. On next tick, the room is visible; `room.find(FIND_SOURCES)` lists
   the 4 sources.
4. Add to `Memory.centerRooms[roomName]` with sources.

```js
Memory.centerRooms[roomName] = {
    sources: [
        { id: '<id>', x: 12, y: 23 },
        ...
    ],
    containerSites: [],    // queued
    containers: [],
    lastSeen: <Game.time>,
    threats: [],
};
```

## B. Highway hauler

`src/tasks/types/taskHighwayHaul.js` (new) — body
`[CARRY*16, MOVE*8]` (1600 energy) walks from the highway containers
to the home storage, deposits, walks back. The route is much longer
than a regular remote (50+ tiles), so the hauler count is small
(1 per source).

The hauler does NOT use `routeCache` for the center walk because the
route is the same in both directions (highway rooms have no exit
shortcuts). v1's routeCache works for the center walk too, but the
`getNextStep` is more complex than needed.

```js
// Pseudocode
function runHighwayHaul(creep) {
    if (creep.store[RESOURCE_ENERGY] === 0) {
        // Walk to highway containers
        const containers = findHighwayContainers(creep.memory.centerRoom);
        if (containers.length === 0) return;
        const target = creep.pos.findClosestByPath(containers);
        creep.withdraw(target, RESOURCE_ENERGY);
    } else {
        // Walk home via the highway exit
        const exit = creep.pos.findClosestByPath(FIND_EXIT);
        creep.moveTo(exit);
        // ... then walk to storage in home room
    }
}
```

## C. Container pattern

Center sources are 4-cornered, ~20-25 tiles from the room center. The
AI places a container on each corner. The miner mines the corner
source and deposits into the adjacent container.

A single hauler can't visit all 4 corners in one trip; v2 uses 2
haulers per center room.

## D. Configuration

| Constant | Default | Description |
|---|---|---|
| `CENTER_SCAN_INTERVAL` | 5000 | Ticks between center scans |
| `CENTER_MIN_DISTANCE` | 3 | Min linear distance from 'E0N0' to qualify |
| `CENTER_MAX_HAULERS` | 4 | Cap per center room |
| `CENTER_MAX_DISTANCE_TO_HOME` | 30 | Skip center rooms too far |

## E. Files to add / change

| Path | Type |
|---|---|
| `src/managers/centerScan.js` | new — center detection + registration |
| `src/tasks/types/taskHighwayHaul.js` | new — hauler role |
| `src/tasks/types/taskCenterMine.js` | new — miner role (similar to remoteMine) |
| `src/tasks/tasksIndex.js` | register `centerMine`, `highwayHaul` |
| `src/config/roles.js` | add `centerMiner`, `highwayHauler` |
| `src/config/priorities.js` | `CENTER_MINE: 81` (between REMOTE_MINE and MINE), `HIGHWAY_HAUL: 51` |
| `src/economy/creepsBodies.js` | `CENTER_MINER_BODIES`, `HIGHWAY_HAULER_BODIES` |
| `src/economy/creepsQuotas.js` | conditional `centerMiner: 4` and `highwayHauler: 2` per active center room |
| `src/managers/roomManager.js` | include `centerRoom` in the snapshot (or add a separate `centerRooms` field) |
| `src/utils/memorySchema.js` | `getCenterRooms`, `ensureCenterRoom` |
| `tests/mocks/screeps.js` | no change — center rooms use existing FIND_SOURCES |

## F. Memory layout

```js
Memory.centerRooms = {
    [roomName]: {
        sources: [{ id, x, y }],
        containerSiteIds: [],
        containerIds: [],
        lastSeen: <Game.time>,
        threats: [],
        lastScanTick: <Game.time>,
    },
};
```

## G. Test plan (`tests/managers/centerScan.test.js`)

```js
test('identifies center rooms by linear distance', () => {
    const candidates = centerScan.findCenterCandidates('E1N1');
    assert.ok(candidates.includes('E0N0') || candidates.includes('W0N0'));
});

test('skips non-center rooms', () => {
    const candidates = centerScan.findCenterCandidates('E1N1');
    assert.ok(!candidates.includes('E1N2'));
});

test('queues container sites for each source', () => {
    centerScan.tick();
    for (const name in Memory.centerRooms) {
        assert.ok(Memory.centerRooms[name].containerSiteIds.length > 0);
    }
});
```

## H. Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| Center room not visible | Observer queue drift | `centerScan` re-queues on every tick |
| Hauler dies crossing the highway | Hostile players | Spawn 2 haulers and accept the loss; switch to a safer center |
| Containers decay before pickup | No container queue | Center-specific container strategy with repair |
| No center room accessible | All highways blocked by enemy reservations | Skip; the regular remote mining continues |

## I. Open questions (v2)

- **Multi-center scan.** With GCL > 1, you can mine multiple center
  rooms. v1 caps at 1; v2 lifts the cap.
- **Observer cost.** Each center scan costs an observer slot. v2
  could compute "expected profit" (sources × travel time) and pick
  the best.
- **Highway SK rooms.** SK rooms have 0-2 sources and are common
  on the map edges. v2 adds SK support.
- **Defensive highway mining.** With hostile players, the center
  becomes a warzone. v2 spawns a defender escort for the hauler.
