# Efficiency Audit — Harvesting / Mining / Hauling

Observations from a code review of the harvest/mine/haul pipeline. Each item
includes file:line references for navigation and a recommended fix sketch.

## Significant inefficiencies

### 1. Miners oversaturated vs source regen (highest impact)

- A source regenerates 3000 energy / 300 ticks = **10 energy/tick**.
- 1 WORK part harvests 2/tick, so a single 5-WORK miner fully saturates a source.
- `taskMine.cap = 4` per source (`src/tasks/types/taskMine.js:10`) and
  `creepsQuotas.QUOTAS` sets `miner: 4` at RCL 5-8
  (`src/economy/creepsQuotas.js:9-13`).
- With 2 sources that's 2 miners per source, each at 8-16 WORK at high RCL
  (`src/economy/creepsBodies.js` MINER_BODIES, 1100+ tiers).
- Result: **24-32 WORK per source vs 10/tick regen**, so miners sit idle
  ~60-70% of the time and waste spawn energy + CPU on bodies that don't mine.

**Recommended approach:** cap 1-2 miners per source; drop the `miner` quota
to 2 once bodies reach 6+ WORK. One large miner per source plus a pre-spawned
replacement (already handled by `PRE_SPAWN_TTL` in
`src/managers/spawnManager.js:34`) is optimal.

### 2. Hauler container withdrawal threshold too low

- `taskHaul.tasks` admits any container with `store[RESOURCE_ENERGY] >= 20`
  (`src/tasks/types/taskHaul.js:24`).
- A hauler will walk across the room for 20 energy.
- The score `dist - Math.min(energy/25, 20)` (`taskHaul.js:33`) gives a
  20-energy container only -0.8 advantage, essentially no preference vs a
  full container at the same distance.

**Recommended approach:** raise the admission threshold to ~100-200 (or scale
it to the hauler's CARRY capacity), and/or steepen the energy bonus so full
containers win clearly over nearly-empty ones.

### 3. taskSweep targets tiny drops with no amount weighting

- `taskSweep.tasks` emits every dropped resource, tombstone, and ruin
  regardless of amount (`src/tasks/types/taskSweep.js:13-27`), unlike
  `energyService` which uses `DROPPED_ENERGY_MIN = 100`
  (`src/config/constants.js:51`).
- A 5-energy drop becomes a sweep target a hauler will walk to.
- `taskSweep.score` is pure path distance (`taskSweep.js:28-30`) — no
  preference for larger piles.

**Recommended approach:** apply the `DROPPED_ENERGY_MIN` threshold to dropped
energy, and add a small amount-based bonus to `score` so large piles and
tombstones win over small drops.

## Minor inefficiencies

### 4. Hauler task-release churn after each delivery

- `taskHaul.run` returns `false` after fully emptying
  (`src/tasks/types/taskHaul.js:64`), forcing a re-evaluation tick before the
  next haul.
- The same creep could keep the task and re-collect from the same or an
  adjacent container in the same tick.

**Recommended approach:** return `true` on a successful delivery and let the
normal `shouldSwitch` logic reassign; or keep the task and pick the next
container in the same tick.

### 5. Short `reusePath` defaults

- `moveUtil.moveCreep` defaults `reusePath: 5`, or `2` on roads
  (`src/utils/moveUtil.js:57,88`).
- Short re-use causes more frequent re-pathing and higher CPU, especially
  for stable miner and hauler loops.

**Recommended approach:** raise the default to 10 for stable loops; keep 5
(or shorter) only for combat/follow paths that change target frequently.

### 6. Miner CARRY:WORK ratio starves big miners on deposit ticks

- Larger miners harvest faster (fill CARRY sooner), but the
  `MINER_BODIES` CARRY:WORK ratio stays ~1:4 across most tiers
  (`src/economy/creepsBodies.js`).
- Each deposit tick replaces a harvest tick; bigger miners lose a larger
  fraction of throughput per deposit.

**Recommended approach:** give big miners proportionally more CARRY (e.g.
4 CARRY for 8 WORK -> 8 harvest ticks between deposits vs 4).

### 7. `taskHarvest.run` returns false on depleted source

- `taskHarvest.run` returns `false` when `live.energy === 0`
  (`src/tasks/types/taskHarvest.js:60`).
- Releasing the task forces a re-evaluation next tick; for a harvester that
  just wants to wait out regen it's wasted churn.

**Recommended approach:** return `true` to hold the slot until the source
regenerates; release only if the source is gone entirely.

## Already well-optimized (regression reference)

- Snapshot model avoids repeated `room.find` calls
  (`src/managers/roomManager.js`).
- Miners pre-spawn 100 ticks before death (`PRE_SPAWN_TTL`,
  `src/managers/spawnManager.js:34`).
- Source-link -> controller/storage link pipeline offloads haulers
  (`src/managers/upkeep/linkService.js`).
- Dropped-energy pickup by idle miners when source is depleted
  (`src/tasks/types/taskMine.js:96-114`).
- `haul:` flag priority containers act as caches
  (`src/utils/roomFlags.js`, `src/services/energyService.js:120-132`).
- Sticky refuel-source lock to prevent ping-pong
  (`src/services/energyService.js:78-86`).
- Role-based task filtering cached per (room, role)
  (`src/managers/creepRunner.js:638-648`).
- Failed-task blacklist prevents thrash on stale targets
  (`src/managers/creepRunner.js:680`).

## Recommended fix order

1. **#1 Miner oversaturation** — largest throughput + spawn-energy payoff.
2. **#2 Haul threshold** — large CPU savings, trivial change.
3. **#3 Sweep amount weighting** — pairs with #2 for hauler efficiency.
4. **#6 Miner CARRY:WORK** — throughput; benefits from #1 first.
5. **#5 reusePath defaults** — global CPU savings, low risk.
6. **#4 Hauler task-release churn** — minor throughput gain.
7. **#7 taskHarvest on depleted source** — minor churn reduction.