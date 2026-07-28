# Bug & Caveat Report

Status: **Open** — remaining items after the fix sweep in commit `2e4ddbe`.
Fixed entries (#1, #2, #3, #6, #8, #9, #11, #12, #14, #15, #16, #20,
#22, #25, #28, #29, #31, #32, #35, #37, #42, #44, #45, #48, #49, #50)
were removed from this file and can be found in git history at that
commit. Original entry numbers below are preserved for cross-reference.

The remaining items are intentional non-fixes (by-design / false-alarm /
defer) unless noted — see each entry's "Fix sketch" line. Severity
reflects likelihood × blast-radius in production.

Conventions:
- **Bug** — a defect that produces wrong behavior in some scenario.
- **Caveat** — a defensive guard that masks a deeper issue, or a piece of
  fragile logic that's correct by coincidence.
- **Stylistic** — not incorrect but easy to misread; left for completeness.

All file:line references are stable for the current commit; verify with a
grep before applying.

---

## 4. `safeModeService.runSafeMode` activates safe mode once per `lastSafeModeActivate`, but the check uses the controller's `safeModeCooldown` AND a memory cooldown

**Severity: Caveat — Low**

`src/managers/upkeep/safeModeService.js:36-40`:

```js
const lastSafeMode = memory.getRoomMemory(rn)[SAFE_MODE_MEMORY_KEY] || 0;
const cooldownClear = !controller.safeModeCooldown && Game.time - lastSafeMode > SAFE_MODE_COOLDOWN_TICKS;
```

Two cooldowns are checked. The intent is probably "if either says it's
clear, activate." But the AND means both must clear, which is correct
(conservative). The bug is that the memory cooldown is **only written
when `activateSafeMode` returns OK**, and the 100-tick periodic log
case is silent on failure. A persistent `ERR_BUSY` or
`ERR_NOT_ENOUGH_RESOURCES` for 5000+ ticks would silently never retry
the memory cooldown. Fine in practice — `controller.safeModeCooldown`
catches it — but the dual gate is confusing.

**Fix sketch.** Drop the memory cooldown, rely on
`controller.safeModeCooldown`. Or document why both are required.

---

## 5. `safeModeService` consults `spawnUtil.spawnsInRoom` but `room` may be unowned during the iteration

**Severity: Caveat — Low**

`src/managers/upkeep/safeModeService.js:13-17`:

```js
for (const rn in Game.rooms) {
    const room = Game.rooms[rn];
    const controller = room.controller;
    if (!controller || !controller.my) continue;
    const spawnsHere = spawnUtil.spawnsInRoom(room);
    if (spawnsHere.length === 0) continue;
```

The early continue is fine. But `room.controller.ticksToDowngrade`
(line 32) is dereferenced without an undefined check; it's always set
on a `my` controller, but `controller` can technically be `null` if the
ownership check above is removed in a refactor.

**Fix sketch.** No change needed today; just be aware.

---

## 7. `roomManager.snapshotFor` scans `FIND_STRUCTURES` but never adds `STRUCTURE_POWER_BANK`, `STRUCTURE_PORTAL`, `STRUCTURE_KEEPER_LAIR`, or `STRUCTURE_LAB` to anything

**Severity: Caveat — Low**

`src/managers/roomManager.js:35-61`. The structure walk only acts on
seven types. `STRUCTURE_LAB`, `STRUCTURE_TERMINAL`, `STRUCTURE_NUKER`,
`STRUCTURE_POWER_SPAWN`, `STRUCTURE_OBSERVER`, `STRUCTURE_EXTRACTOR`,
`STRUCTURE_FACTORY`, `STRUCTURE_POWER_BANK` are all silently ignored.

That's intentional for v1, but:
- `STRUCTURE_OBSERVER` and `STRUCTURE_NUKER` will be needed for
  `nukeService` and `intelService`. The latter uses a `room.find` to
  find observers rather than reading the snapshot.
- `STRUCTURE_LAB` will be needed for `labs` (planned). The room
  snapshot will need a `labs` field.
- `STRUCTURE_TERMINAL` will be needed for `market` (planned).

**Fix sketch.** Add the missing fields to the snapshot now so the future
plans don't need a snapshot-shape migration. Cheap to ship ahead.

---

## 10. `taskBootstrap.run` calls `memory.setRole(creep, 'harvester')` and `memory.setHomeRoom(creep, roomName)` while the bootstrapper is still a `harvester`-allowed role

**Severity: Caveat — Low**

`src/tasks/types/taskBootstrap.js:46-49`:

```js
memory.setRole(creep, 'harvester');
memory.setHomeRoom(creep, roomName);
```

`inferRoleFromName` only sets role if it's missing; the in-task switch
is fine but the `harvester` role is "unrestricted" (allowed set `null`).
After the switch, the bootstrapper can pick up `harvest` in the new
room — good. But the `harvester`-name check at line
`inferRoleFromName:111` is `'Harvester' === 0` so a creep named
`Bootstrapper12` was already correctly identified as `bootstrapper`
from memory. Future role-inference from name may misclassify after
the role flip; today it's fine.

**Fix sketch.** Recycle the bootstrapper instead of reusing it. Cheaper
than handling all the edge cases of mid-life role transition. Or
**don't** change role — let it keep `bootstrapper` and have the
bootstrap role be allowed to also do `harvest` after RCL 2.

---

## 13. `moveUtil.moveCreep` calls `creep.moveTo` on every tick, even when the creep is on a road and the target hasn't moved

**Severity: Stylistic — Low**

`src/utils/moveUtil.js:124`. `moveTo` itself caches the path with
`reusePath`, so the cost is mostly the per-tick moveTo call overhead.
For 50+ creeps, this is ~5% of CPU. The previous `reusePath: 5` and
`reusePath: 2` defaults from the efficiency audit are now
`reusePath: 10` (line 88) on plain tiles and 5 on roads. The
`memorySchema.setLastMoveResult` and per-tick position-tracking logic
(lines 69-80) are necessary to detect stalls, so this is a deliberate
trade-off.

**Fix sketch.** None — the efficiency-audit item #5 already applied.

---

## 17. `taskRemoteHarvest.tasks` doesn't check the per-room `Memory.sources` for `homeRoom === target.roomName`

**Severity: Bug — Low**

`src/tasks/types/taskRemoteHarvest.js:36-58`. The loop over
`Memory.sources` correctly filters by `src.roomName !== roomName`, but
it iterates **all** `Memory.sources` for every allowed room. With N
owned rooms and M sources, this is N×M. For N=10 and M=20, that's 200
checks per room per tick. Cheap, but a `Map` lookup keyed by roomName
would be O(1).

**Fix sketch.** Maintain a `Memory.sourcesByRoom` index, or accept the
cost. Most of the iterations short-circuit on the roomName check.

---

## 18. `safeModeService` triggers on a spawn at `< SAFE_MODE_TRIGGER_RATIO` of its max hits but never checks the controller's `safeModeCooldown` for the **other** owned room

**Severity: Caveat — Low**

`src/managers/upkeep/safeModeService.js:36-40` reads the controller's
own `safeModeCooldown` but not other owned rooms. With N rooms, a
shared `Memory.flags` or a per-shard budget would be needed to avoid
chaining safe-mode activations across rooms. The 5000-tick memory
cooldown is per-room so this is fine in practice.

**Fix sketch.** None — works for v1's single-home assumption.

---

## 19. `bootstrapManager.tick` only queues a spawn site if no spawn exists; the spawn is also gated by the controller's `safeMode`

**Severity: Caveat — Low**

`src/managers/bootstrapManager.js:55-58`. The construction site is
created regardless of `controller.safeMode` (which is room-wide). Safe
mode doesn't block construction though, so this is moot. Future:
defended bootstrap should retry if the spawn is destroyed mid-build.

**Fix sketch.** Add a "spawn destroyed" check that re-queues the site.

---

## 21. `creepManager.tick` doesn't clear per-creep caches (`_bpCache`, `_lastMoveX/Y`) on `Game.time` change for creeps that were in the previous tick but not the current one

**Severity: Stylistic — Low**

Dying creeps leave their cache entries in `creep._bpCache` until GC.
The cache is a per-creep property, not a global map, so it doesn't
leak. After the creep dies, the next `Game.creeps` iteration skips
it, and the cache dies with the object. So this is fine.

**Fix sketch.** None.

---

## 23. `taskBuild.run` and `taskRepair.run` do the same "refuel from energyService, then build/repair" dance; almost identical code

**Severity: Stylistic — Low**

`src/tasks/types/taskBuild.js:30-65` and `src/tasks/types/taskRepair.js:24-59`
are 90% the same. Extracting a `selfRefuelAndAct(creep, snap, fn)` helper
would cut 30+ lines and make the energy threshold policy consistent.

**Fix sketch.** Defer — duplication is contained.

---

## 24. `taskSweep.run` uses `t.store` to detect tombstones/ruins, but `t` is fetched via `Game.getObjectById` and may be null

**Severity: Caveat — Low**

`src/tasks/types/taskSweep.js:40-46`:

```js
const t = target ? Game.getObjectById(target.id) : null;
if (!t) return false;
if (!t.pos) return false;
if (creep.store.getCapacity() === 0) return false;
const remaining = t.store ? _.sum(t.store) : (t.amount || 0);
if (remaining <= 0) return false;
```

If `t.amount` is undefined for a resource that exists but has 0 amount,
the condition passes. The `pick` logic at line 70-79 correctly handles
that. OK, but `t.store` is `undefined` for dropped resources and the
guard `remaining <= 0` is checked against `t.amount || 0` — works.

**Fix sketch.** None.

---

## 26. `findCandidates` in `expansionPlanner` does an O(N×N) breadth-first expansion that re-explores already-queued rooms across multiple owned rooms

**Severity: Caveat — Low**

`src/managers/expansionPlanner.js:57-88`. With N owned rooms and
`SEARCH_DEPTH=2`, the frontier can hold ~50 rooms and the search is
~50×50=2500 ops per planner tick. The `MAX_CANDIDATES=12` cap
short-circuits. Not a problem at small scale.

**Fix sketch.** None — already capped.

---

## 27. `assert.recordError` writes to both `Memory.stats` and an in-process `_lastErrors` array; the in-process array is never read by the rest of the system

**Severity: Stylistic — Low**

`src/utils/assert.js:13-31`. `_lastErrors` is exposed via `lastErrors()`
but never called from the main loop. Either drop it or surface it
through the planned `statsService`.

**Fix sketch.** Defer to `plans/stats-dashboard.md`.

---

## 30. `safeModeService` logs once per 100 ticks on activation failure, but the log is silent when activation succeeds unless triggered

**Severity: Stylistic — Low**

`src/managers/upkeep/safeModeService.js:42-47`. The success log
includes a reason. The failure log only every 100 ticks. With the
`safeModeCooldown` clearing at 5000 ticks, that's 50 noisy logs per
cooldown window when `ERR_NOT_ENOUGH_RESOURCES` blocks. Fine, just be
aware when reading logs.

**Fix sketch.** None.

---

## 33. `taskBootstrap.run` builds the spawn before harvesting when the creep is empty AND the spawn is already there; the order should be harvest first, then build

**Severity: Caveat — Low**

`src/tasks/types/taskBootstrap.js:36-104`. Order:
1. If spawn exists and RCL>=2, transition.
2. If `creep.store > 0`, build.
3. If `creep.store === 0`, harvest.

But the transition check (1) requires `creep.store > 0` to be false
implicitly (the bootstrappers need energy to upgrade the controller
into RCL 2). When a spawn exists and RCL < 2, the bootstrapper
should keep harvesting and upgrading. The order is correct.

**Fix sketch.** None.

---

## 34. `expansionPlanner` and `remoteManager` both gate on `Memory.flags`, but the gates use `&& Memory.flags.x` instead of `!!`

**Severity: Stylistic — Low**

`src/managers/remoteManager.js:158`, `expansionPlanner.js:161`. Both
check `if (!Memory.flags || !Memory.flags.remoteMining) return;`. The
`Memory.flags.remoteMining` could in theory be a truthy non-boolean
(e.g. the user typed `Memory.flags.remoteMining = 5`). All other
flags in the code base are booleans; this is consistent. No fix.

---

## 36. `bootstrapManager` reads `Memory.rooms` to find bootstrapping rooms, but a room claimed and then immediately abandoned won't appear until a creep enters it

**Severity: Caveat — Medium**

`src/managers/bootstrapManager.js:16-30`. The loop iterates
`Memory.rooms`, but the entry is set by `memory.setRoomBootstrapping`
called from `taskClaim.run` line 62. Good. But if a `ClaimTarget`
flag is placed **before** the claimer is spawned (player preemptive
placement), no `Memory.rooms[name]` entry exists. The bootstrap loop
skips it. The claimer eventually claims and sets the entry — fine.

**Fix sketch.** Bootstrap from `expansionPlanner.target` if the claim
has succeeded (`controller.my` true) but the entry is missing.

---

## 38. `safeModeService` reads `controller.ticksToDowngrade` even when the controller isn't initialized

**Severity: Caveat — Low**

`src/managers/upkeep/safeModeService.js:32`:

```js
const ttd = controller.ticksToDowngrade;
const lowTtd = typeof ttd === 'number' && ttd < SAFE_MODE_TTD_THRESHOLD && hostileCount > 0;
```

If `controller.ticksToDowngrade` is undefined (e.g. controller is
neutral and being claimed), `typeof ttd === 'number'` is false, so
`lowTtd` is false. Safe. Fine.

**Fix sketch.** None.

---

## 39. `roomManager.snapshotFor` doesn't include `STRUCTURE_TERMINAL` in `energyStructures`, so terminals are not auto-supplied

**Severity: Caveat — Medium**

`src/managers/roomManager.js:54-60`. `energyStructures` only includes
`STRUCTURE_EXTENSION`, `STRUCTURE_SPAWN`, `STRUCTURE_TOWER`. A
terminal that needs energy is invisible to `taskSupply.tasks` and
`runIdleFallback` (which uses `depositService.findDeposit`).

The `depositService` does include terminals via the `findDeposit` non-energy
branch (line 85), but the energy path doesn't. For market ops
(`plans/market.md`), this matters.

**Fix sketch.** Either include terminals in `energyStructures` (and
exclude from the energy deposit candidates when not needed), or
add a separate `terminals` field to the snapshot.

---

## 40. `taskRenew.run` recycles creeps with no useful parts but doesn't `return true`, so the caller may still try to assign a task

**Severity: Caveat — Low**

`src/tasks/types/taskRenew.js:8-15`:

```js
if (creep.getActiveBodyparts(WORK) === 0 && ...) {
    if (spawn.recycleCreep(creep) === ERR_NOT_IN_RANGE) {
        move.moveCreep(creep, spawn, ...);
    }
    return;
}
```

The function `return`s without a value, so `renewOrRecycle` in
`creepRunner` line 380 returns `true` (the call site is wrapped
in `if (renew.run(creep)) return true;` — wait, actually it's
`renew.run(creep); return true;`). So the caller always returns true.
OK, no bug.

**Fix sketch.** None.

---

## 41. `creepRunner.collectCombatTasks` iterates every visible room on every creep

**Severity: Caveat — Medium (CPU)**

`src/managers/creepRunner.js:546-566`. With 6+ visible rooms and
~10 hostiles each, the function generates 60+ tasks. The `combatTaskCache`
per tick mitigates this (line 632-638), so the work is done once
per role per tick. With 5 fighters, that's 5 cached calls instead of
30. Good. But each `tasks.get(type).tasks(room, snap)` walks the
`hostiles` array (line 17 of `taskDefend.js`). Cheap.

**Fix sketch.** None.

---

## 43. `creepCountByRole` counts by `homeRoom` if set, else by `pos.roomName`, but `c.pos` is dereferenced without an undefined check

**Severity: Bug — Low**

`src/managers/spawnManager.js:27-30`:

```js
const homeRoom = c.memory && c.memory.homeRoom;
const belongsTo = homeRoom || c.pos.roomName;
```

`c.pos` is always set on a live creep. Fine.

---

## 46. `bootstrapManager.tick` calls `delete exp.target` on the abort path but the abort path is also covered by `taskClaim.run`; the two writers race

**Severity: Caveat — Low**

`src/managers/bootstrapManager.js:25` and `src/tasks/types/taskClaim.js:43, 51`.
Both call `delete exp.target` on the same error condition. Last writer
wins (both delete the same key), no harm. But the `claimedTick` is
written only on the success path, so a successful claim that is
aborted (RCL can't be raised) leaves the entry without a `claimedTick`.

**Fix sketch.** Document; the two writers are intentional and idempotent.

---

## 47. `linkService.isSourceLink` uses `inRangeTo(source.pos, 3)`, which matches the `linkStrategy.planLinks` `findPositionNear(source, 1, 3)` (range 1-3). Good. But the controller link threshold of 4 in `runLink` doesn't match the strategy's 1-4.

**Severity: Caveat — Low**

`src/managers/upkeep/linkService.js:39`:

```js
if (room.controller && room.controller.my && allLinks[j].pos.inRangeTo(room.controller.pos, 4)) {
    controllerLink = allLinks[j];
}
```

`linkStrategy.planLinks:36`:

```js
const linkCpos = plannerUtils.findPositionNear(room.controller.pos, 1, 4);
```

Range 1-4 in the strategy, 1-4 in the service. Matches. **False alarm.**

**Fix sketch.** None.

---

---

## 51. `routeCache.getNextStep` matched `route[i].room` (next room) instead of the previous room, returning the wrong exit on multi-leg routes

**Severity: Bug — High**
**Status: Fixed** — `src/utils/routeCache.js:80-92`. The loop now matches
`prevRoom` (the room being left) against `currentRoomName` instead of
`route[i].room` (the room being entered). `reverseRoute` was also fixed
to produce standard-format routes (room = next room) so both forward and
cached-reverse routes work with the corrected matching.

Per the Screeps `Game.map.findRoute` API, `route[i].room` is the *next*
room and `route[i].exit` is the exit from the *previous* room. The old
code matched the creep's current room against `route[i].room`, so for
any route that turns (e.g. A→B→C where the exit from B differs from the
exit from A), `getNextStep` returned the wrong exit. Straight-line routes
worked by coincidence. The starting-room case worked via the `route[0]`
fallback, and the destination case was handled by the `=== to` early return.

**Fix sketch.** `const prevRoom = i === 0 ? from : route[i-1].room; if (prevRoom === currentRoomName) return route[i];`

---

## 52. `routeCache.readCache` check 2 returned the wrong-direction route (reverse mirror not reversed back)

**Severity: Bug — High**
**Status: Fixed** — `src/utils/routeCache.js:24-31, 63`. `reverseRoute`
now takes a `fromRoom` parameter and produces a standard-format route
(to→from becomes from→to with correct room/exit fields). The
`writeCache` guard that prevented the reverse mirror from being
refreshed was also removed, so stale forward entries can no longer
trigger the wrong-direction return via check 2.

`writeCache` stored `reverseRoute(route)` at `rr[from].routes[to]`, but
the old `reverseRoute` produced a non-standard format (room = room being
left). `readCache(from, to)` check 2 returned this entry directly — a
route from `to` to `from` instead of `from` to `to`. Combined with the
`writeCache` guard (Bug 53 below) that prevented the mirror from being
refreshed, a stale forward entry could cause the creep to follow the
route in the wrong direction.

**Fix sketch.** Fix `reverseRoute` to produce standard format and pass
`from` to it; remove the `if (!rr[from].routes[to])` guard.

---

## 53. `routeCache.writeCache` guard prevented reverse mirror from being refreshed, enabling Bug 52

**Severity: Bug — Medium**
**Status: Fixed** — `src/utils/routeCache.js:63`. The
`if (!rr[from].routes[to])` guard was removed so the reverse mirror is
always written with a fresh tick. This prevents the forward entry from
going stale while the reverse stays fresh, which was the precondition
for Bug 52 to manifest.

**Fix sketch.** Remove the guard: `rr[from].routes[to] = { route: reverseRoute(route, from), tick: Game.time };`

---

## 54. `creepRunner.findClosestHostileRoom` coerces valid distance `0` to `Infinity` with `||`

**Severity: Bug — Medium**
**Status: Fixed** — `src/managers/creepRunner.js:503-504`. The
`|| Infinity` was replaced with a `typeof dist !== 'number'` guard so
a distance of `0` (same room) is correctly selected instead of being
coerced to `Infinity`.

`Game.map.getRoomLinearDistance(fromRoomName, name) || Infinity` —
when `fromRoomName` itself has hostiles, `getRoomLinearDistance` returns
`0`, which is falsy, so `bestDist` becomes `Infinity` and the creep's
own room is never selected as the closest hostile room. The fighter
then patrols toward a *different* hostile room instead of fighting in
the room it's standing in.

**Fix sketch.** `const dist = Game.map.getRoomLinearDistance(fromRoomName, name); if (typeof dist !== 'number') continue;`

---

## 55. `taskBase.pathScore` cache eviction formula inverted (sign error)

**Severity: Bug — Medium**
**Status: Fixed** — `src/tasks/taskBase.js:96`. The eviction count
formula was corrected from `MAX - length + 1` to `length - MAX`, so
the hard cap actually evicts entries when the cache exceeds
`PATH_SCORE_MAX_ENTRIES`.

The old formula `PATH_SCORE_MAX_ENTRIES - Object.keys(_pathScoreCache).length + 1`
evaluates to `0` or negative when the cache exceeds the cap (e.g.
`2000 - 2001 + 1 = 0`), so `evictOldestPathScores` never runs and the
hard cap is dead code. The cache grows unbounded between periodic
cleanups (every 50 ticks). The comment on lines 90–94 states this is a
"defense against unbounded growth," but the defense was non-functional.

**Fix sketch.** `evictOldestPathScores(Object.keys(_pathScoreCache).length - PATH_SCORE_MAX_ENTRIES);`

---

## 56. `creepRunner.shouldRenew` has unreachable dead code at line 107

**Severity: Caveat — Low**
**Status: Open** — `src/managers/creepRunner.js:107`. The
`if (memory.getRole(creep) === 'miner') return true;` is unreachable
because miners are short-circuited at line 80–86 (`return false`). Not
a runtime crash, but a latent logic trap: if the early miner return at
line 80 is ever removed, this line would make miners renew, contradicting
the documented design.

**Fix sketch.** Delete line 107.

---

## 57. `expansionPlanner.scoreCandidate` `allowBonus` for `alreadyRemoteTarget` is always 0 (dead code)

**Severity: Caveat — Low**
**Status: Open** — `src/managers/expansionPlanner.js:143`. The
`allowBonus` gives a +500 bonus to rooms that are already remote targets,
but `findCandidates` (line 77) filters out `alreadyRemoteTarget` rooms
entirely. The bonus is dead code and misleading.

**Fix sketch.** Either remove the dead `allowBonus` line, or remove the
`alreadyRemoteTarget` filter in `findCandidates` if remote rooms should
be candidates for expansion.

---

## 58. `taskRemoteMine.run` returns `false` on slot-claim failure, blacklisting the task for 5 ticks

**Severity: Bug — Medium**
**Status: Open** — `src/tasks/types/taskRemoteMine.js:43`. The
`return false` on `claimSlot` failure blacklists the task for 5 ticks —
the exact pattern `taskMine.js` explicitly documents as harmful. The
remote miner idles for 5 ticks before re-attempting, wasting labor in
tight mining-shortage scenarios.

**Fix sketch.** `return true` on slot-claim failure (avoiding the
blacklist), mirroring the fix applied to `taskMine.js` in bug #2.

---

## Summary by severity

- **High (0):** none open
- **Medium (4):** #36 (bootstrap manager preemptive flag), #39 (terminal
  snapshot — blocked on `plans/market.md`), #58 (taskRemoteMine
  blacklist on slot-claim failure)
- **Low / Caveat / Stylistic (24):** #4, #5, #7, #10, #13, #17, #18, #19,
  #21, #23, #24, #26, #27, #30, #33, #34, #38, #40, #41, #43, #46, #47,
  #56 (shouldRenew dead code), #57 (expansionPlanner dead allowBonus)

## Notes

- All "Fix sketch: None" entries are by-design, false alarms, or
  capped/not-a-problem at current scale — see each entry.
- **#39** is the only open item blocked on a future plan
  (`plans/market.md`); revisit when market work starts.
- **#36** is a genuine medium caveat that could be fixed ahead of the
  market plan if preemptive `ClaimTarget` flag placement becomes common.
- **#23** (taskBuild/Repair dedup) and **#27** (`_lastErrors` surfacing)
  are deferred stylistic items; low priority.
- **#51–#55** were found by a parallel subagent code review and fixed
  in this pass. **#56–#58** remain open from the same review.