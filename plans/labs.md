# Labs — Auto-Compound & Boost Pipeline

Status: **Planned**. v1 scope: per-room reaction queues, an idle creep
`taskLab` that operates the labs, and a `boostManager` that injects
boost requests into the spawn queue for specific roles on demand.

## Goal

RCL 6 enables 3 labs; RCL 8 enables 10. With mineral harvesting and a
lab, the AI can compound intermediate minerals and boost combat creeps
(especially defenders) for significantly higher survivability. v1 ships:

1. **Auto-compound** — keep a `Memory.labs[roomName].reactions` queue
   per owned room with minerals in the highest-tier recipes
   (`XGHO2`, `XLHO2`, `XZHO2`, `XZH2O`, `XGH2O`, `XLH2O`, `XKH2O`).
2. **Boost on demand** — a `boostManager` that flags fighter/healer
   bodies with the right boosts when `Memory.labs.boosts[role]` is
   set. Spawned creeps visit the lab on spawn.

## Prerequisites / gates

- `controller.level >= 6` (3+ labs available).
- Terminal built (for moving minerals between rooms).
- `Memory.labs.<room>` initialized (see Migration).
- Feature flag `Memory.flags.labs === true` (off by default; lab
  operations are CPU-expensive).

## A. Lab model

A lab is a `STRUCTURE_LAB` with `mineralType`, `mineralAmount`,
`storeCapacity`, and `cooldown`. Two labs run a reaction when they each
hold a different mineral in a valid pair. After 10 cooldown ticks, a
new mineral is produced (subject to loss). Per-room, the AI maintains:

```js
Memory.labs = {
  [roomName]: {
    lab1: '5bbcc1',           // lab id used as input #1
    lab2: '5bbcc2',           // lab id used as input #2
    output: '5bbcc3',         // lab id that receives the product
    reactions: [              // queued reactions to run
      { a: RESOURCE_HYDROGEN,  b: RESOURCE_OXYGEN,  amount: 5000, product: RESOURCE_HYDULIUM },
      { a: RESOURCE_LEMERGIUM, b: RESOURCE_UTRIUM,  amount: 5000, product: RESOURCE_GHODIUM },
      ...
    ],
    boosts: {                 // role -> [{ mineral, count }]
      fighter: [{ mineral: RESOURCE_XGHO2, count: 1 }, { mineral: RESOURCE_XLHO2, count: 1 }],
      healer:  [{ mineral: RESOURCE_XLHO2, count: 2 }],
    },
  },
}
```

## B. New: `src/services/labService.js`

Per-tick (bucket > 5000). For each owned room with labs:

1. **Assign labs.** First-time setup picks three labs: the closest
   pair (by `pos.getRangeTo`) plus a separate lab for output. Stored
   in `Memory.labs.<room>` and re-validated each tick by id
   (`Game.getObjectById`); if a lab dies, re-pick and log.
2. **Run a reaction.** If `outputLab.mineralAmount === 0` and the
   next reaction in the queue has enough input to run, call
   `lab1.runReaction(lab2, outputLab)`. A `cooldown > 0` skips the
   tick; the next tick will try again.
3. **Withdraw products.** When a reaction finishes, the output lab
   has a partial product. A creep (`taskLab`) withdraws to terminal
   when the lab is >= 80% full to free the lab for the next reaction.
4. **Stock check.** Before running a reaction, ensure `lab1` and
   `lab2` each have `>= amount` of their respective mineral. If not,
   skip the reaction and emit a `supplyLab` task to top up from the
   terminal.

## C. New: `src/tasks/types/taskLab.js`

Operated by a dedicated `labTech` role. Body: `[CARRY*4, MOVE*4]`
(cheap, multiple). Picks up the next available action:

- **Withdraw product** when `outputLab.mineralAmount > 500`.
- **Top-up inputs** when the queued reaction's input is short.
- **Idle** at a lab otherwise.

The `cap` is 1 (one lab tech is enough for a small room). RCL 8 with
10 labs may justify 2; set per-room via `Memory.labs.cap`.

## D. New: `src/managers/boostManager.js`

Runs per spawn (bucket > 2000). For each role with
`Memory.labs.boosts[role]`, check if the spawned creep is at the lab
and ready to be boosted. Two flows:

1. **Eager boost at spawn** — the spawner attaches a `boostQueue`
   field to the creep's memory. A `taskBoost` (low priority) walks
   the creep to the lab once and calls `lab.boostCreep(creep)`. The
   boost costs one mineral of the appropriate type per body part.
2. **On-demand boost** — `Memory.labs.boosts[role]` is set to
   `{ count: 1, mineral: 'XUH2O' }` and `spawnManager` spawns a
   fighter, flags it for boost, and the boost manager dispatches a
   lab tech to perform the boost.

Eager mode is simpler and preferred for v1. The on-demand mode is
useful for surge spawning (raid detected → boost a few fighters fast).

## E. Recipes (v1)

Top-tier boosts prioritized for combat (heals/damage):

- `XGHO2` = GHO2 + GH + G  → `RANGED_ATTACK * 4` heal
- `XLHO2` = LHO2 + LH + L  → `HEAL * 4` heal
- `XZHO2` = ZHO2 + ZH + Z  → `RANGED_ATTACK * 3` damage
- `XZH2O` = ZH2O + ZH + Z + H + O → `HEAL * 3` damage

`XUH2O` and similar are intermediate. `XKH2O` is the highest tier but
expensive.

## F. Files to add / change

| Path | Type |
|---|---|
| `src/services/labService.js` | new — reaction runner, lab assignment, stock checks |
| `src/tasks/types/taskLab.js` | new — `labTech` body / role |
| `src/managers/boostManager.js` | new — eager + on-demand boost dispatch |
| `src/config/roles.js` | add `labTech` role with `['lab']` allowed |
| `src/config/priorities.js` | add `LAB: 33` (just above `SUPPLY`) |
| `src/economy/creepsBodies.js` | `LAB_TECH_BODIES` template |
| `src/economy/creepsQuotas.js` | add `labTech: 1` at RCL 6+ when labs are present |
| `src/managers/spawnManager.js` | wire the lab-tech spawn; pass `boostQueue` for fighters/healers when `Memory.labs.boosts[role]` is set |
| `src/tasks/tasksIndex.js` | register `lab` |
| `src/utils/memorySchema.js` | accessors for `Memory.labs`, `creep.memory.boostQueue` |
| `src/main.js` | call `labService.tick()` and `boostManager.tick()` |
| `src/managers/roomManager.js` | add `labs: room.find(FIND_MY_STRUCTURES, {filter: STRUCTURE_LAB})` to the snapshot |
| `tests/mocks/screeps.js` | add `STRUCTURE_LAB` (already present), `lab.runReaction` stub, `lab.boostCreep` stub, `lab.transfer` stub |

## G. Memory layout

```js
Memory.labs = {
  [roomName]: {
    lab1: '<id>',  // input A
    lab2: '<id>',  // input B
    output: '<id>',
    reactions: [{ a, b, amount, product }],
    boosts: { fighter: [{ mineral, count }], healer: [...] },
    lastRunTick: <Game.time>,
    stat: { reactionsCompleted: 0, productsWithdrawn: 0 },
  },
};
```

## H. Migration

- Bump `Memory.migrated` to **6** in `globals.js`.
- Initialize `Memory.labs = {}` (lazy `ensureLab(roomName)`).
- Initialize `creep.memory.boostQueue = []` for new creeps.

## I. Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| Reactions stall | Input mineral short | `labService` emits `supplyLab` task; haul-lab creep tops up from terminal |
| Lab tech idles | Output not full yet | Idle wait; logs `[lab] waiting for output` every 100 ticks |
| Boost creep misses the lab | Spawned far from lab | Add `taskBoost` `walkTo` and `reusePath: 50` for the long walk |
| All input consumed | Reaction queue empty | `labService` re-queues default recipes; check `Memory.labs[room].reactions` |
| Cooldown desync | Two ticks since last run | `cooldown > 0` skip handles it; verify with `lastRunTick` delta |

## J. Open questions (v2)

- **Cross-room lab routing.** When one room has labs and another
  has the mineral, move via terminal. v1 assumes a single home room;
  v2 walks the terminal-to-lab hauler path explicitly.
- **Auto-discovery of mineral recipes.** v1 uses a hard-coded recipe
  list. v2 could prioritize by `Memory.stats.mineralsUsed`.
- **Lab destruction recovery.** If a lab is destroyed (raid, decay),
  `labService.tick` re-picks. v2 should log a stat for replacement
  economy.
- **Lab clustering.** `linkStrategy` and `labStrategy` (not yet
  written) should coordinate siting so labs are within range 2 of
  each other.
