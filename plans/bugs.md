# Bug & Caveat Report

Status: **Resolved** — fixes applied for #1, #2, #3, #6, #8, #9, #11,
#12, #14, #15, #16, #20, #22, #25, #28, #29, #31, #32, #35, #37, #42,
#44, #45, #48, #49 (see the "Status:" line on each entry). The remaining
items are intentional non-fixes (by-design / false-alarm / defer) — see
each entry's "Fix sketch" line. Severity reflects likelihood ×
blast-radius in production.

Conventions:
- **Bug** — a defect that produces wrong behavior in some scenario.
- **Caveat** — a defensive guard that masks a deeper issue, or a piece of
  fragile logic that's correct by coincidence.
- **Stylistic** — not incorrect but easy to misread; left for completeness.

All file:line references are stable for the current commit; verify with a
grep before applying.

---

## 1. `spawnUtil.nearestSpawn` returns the wrong spawn when the creep is in a foreign room

**Severity: Bug — High**
**Status: Fixed** — `src/utils/spawnUtil.js:17-28`. The unreachable
`sameRoom` loop is replaced with a `getRoomLinearDistance` fallback so a
1-hop neighbor wins over a 3-hop one.

`src/utils/spawnUtil.js:1-24`. When `creep.pos.roomName` doesn't match any
spawn's room, the function falls through to:

```js
const sameRoom = [];
for (let j = 0; j < spawns.length; j++) {
    if (Game.spawns[j].pos.roomName === creep.pos.roomName) sameRoom.push(spawns[j]);
}
if (sameRoom.length > 0) return sameRoom[0];
return spawns[0];
```

This block is unreachable on the first pass: if no spawn matched
`creep.pos.roomName` (otherwise `best` would have been set and returned),
the `sameRoom` loop populates with the same empty set and the function
falls through to `return spawns[0]` — but `spawns[0]` is in
**iteration order over `Game.spawns`**, not necessarily the spawn's
home room. With multiple owned rooms, a foreign-room creep gets routed
to whatever spawn `for…in Game.spawns` hits first.

`creepRunner.runCreep` already guards this for the "send home" path
(`nearestSpawnInRoom(creep, homeRoomName)` at line 622), but the bare
`nearestSpawn(creep)` calls in `taskRenew.run`, `combatIdleFallback`,
`taskScout.run`, `taskRemoteDefend.run` (recruited defender retreat),
and `squadManager.runSquad` are exposed.

**Fix sketch.** Replace the unreachable second loop with a linear-distance
fallback:

```js
let best = null;
let bestRange = Infinity;
for (let i = 0; i < spawns.length; i++) {
    const r = Game.map.getRoomLinearDistance(creep.pos.roomName, spawns[i].pos.roomName) || 99;
    if (r < bestRange) { bestRange = r; best = spawns[i]; }
}
return best;
```

Cross-room is a `getRoomLinearDistance` proxy — a 1-hop neighbor wins over a
3-hop one. For the final tile, callers fall back to `nearestSpawnInRoom`
once home. Better: change the function signature to take an optional
`preferRoomName` and have callers pass `homeRoom`.

---

## 2. `taskMine` releases the sourceId on a slot-claim failure, but doesn't reset claimCounts or taskId

**Severity: Bug — Medium**
**Status: Fixed** — `src/tasks/types/taskMine.js:45-66`. On `claimSlot`
failure the task now `return true` (avoiding the 5-tick blacklist) and
harvests directly if the miner has CARRY and is already near the source,
so a freshly-freed slot is picked up next tick without idling.

`src/tasks/types/taskMine.js:46-51`:

```js
if (!sourceRegistry.claimSlot(sourceId, creep.name)) {
    sourceRegistry.releaseClaim(creep.name);
    memory.clearSourceId(creep);
    return false;
}
```

`return false` lets `creepRunner.runCreep` black-list the task for 5 ticks
and call `releaseTask(creep, claimCounts)`, which then decrements
`_claimCounts[taskId]` and clears `taskId`. So the chain is correct in
isolation. **But** if `bestTaskFor` immediately re-picks the same mine task
for the same creep next tick (e.g. when the room is in a slot-stripped
state with no other tasks), the 5-tick blacklist prevents that — and the
miner idles for 5 ticks before re-attempting. In tight mining-shortage
scenarios this is wasted labor.

Worse: if `sourceRegistry.claimSlot` returns `false` because another
miner claimed the last free slot **this very tick** (a race we
deliberately permit), the calling miner now has neither sourceId nor
taskId. Next tick it goes to `forceTargetFor` (returns null for a
non-harvester), falls into `runIdleFallback`, and the surrounding
harvesters can starve it out indefinitely.

**Fix sketch.** In `taskMine.run`, on `claimSlot` failure, fall back to
`harvest` if the miner has CARRY, otherwise idle. Don't release — the
next-best alternative is a different source's mine task; the scheduler
should pick it. (May also need to also gracefully fall back if the
miner has no CARRY: see #3.)

---

## 3. Miners without CARRY crash `taskMine.run` at the offload check

**Severity: Caveat — Medium**
**Status: Fixed** — `src/tasks/types/taskMine.js`. The offload and
pickup branches are now guarded on `creep.getActiveBodyparts(CARRY) > 0`,
so a future no-CARRY miner body template won't silently call
`transfer`/`pickup` and set a no-op action label.

`src/tasks/types/taskMine.js:73-90` only fires if
`creep.pos.isNearTo(source)` and `carried > 0`. The very next branch
(`if (source.energy === 0 && creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0)`)
implicitly assumes the miner has CARRY (`getFreeCapacity` is 0 on a
no-CARRY creep, so the condition is false and the branch is skipped —
**lucky**). But `creep.transfer(deposit, RESOURCE_ENERGY)` further down
**requires** CARRY; calling it on a no-CARRY creep returns
`ERR_NO_BODYPART` and the action label is set anyway.

Today's `MINER_BODIES` always include CARRY, so this is dormant. But the
cap was set to 2 in `creepsQuotas` for RCL 3-8 with no body guard.
Adding a body template without CARRY (e.g. for a fast RCL 3 starter)
would break the offload silently.

**Fix sketch.** Guard the offload branch on `creep.getActiveBodyparts(CARRY) > 0`;
also guard `pickup` (used during depletion) the same way. If the miner has
no CARRY, return `true` after a single `harvest` call so it doesn't loop
on a useless action.

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

## 6. `roomManager.snapshotFor` uses `rampartTargetFor(rcl)` but writes the `repairTargets` list without RCL scaling

**Severity: Bug — Medium**
**Status: Fixed** — `src/managers/roomManager.js:39-47`. The critical
threshold is now `Math.min(10000, rampartTarget / 2)` so a 50k-hits
rampart at RCL 8 is triaged as critical while thin low-RCL ramparts
still jump the queue.

`src/managers/roomManager.js:39-42`:

```js
if (st === STRUCTURE_RAMPART || st === STRUCTURE_WALL) {
    if (s.hits < 10000) damagedCritical.push(s);
    else if (s.hits < s.hitsMax) damagedNonCritical.push(s);
    if (s.hits < rampartTarget) repairTargets.push(s);
}
```

The `damagedCritical` threshold is hard-coded to **10000**, ignoring
`RAMPART_TARGET_HITS_BY_RCL` (which ranges from 10000 at RCL 3 to
1000000 at RCL 8). A rampart with 50,000 hits at RCL 8 is "critical"
(needs immediate attention) but with this code is treated as non-critical
because `s.hits < 10000` is false.

The consequence: towers at RCL 8+ repair mid-hits ramparts *after* the
still-low ramparts, not before. Triage is wrong: a low-health RCL-3
rampart (a few hundred hits) jumps the queue over a 50k-hits RCL-8
rampart that's the only thing between the spawn and a 5-creep raid.

**Fix sketch.**

```js
const critThreshold = Math.min(10000, rampartTarget / 2);
if (s.hits < critThreshold) damagedCritical.push(s);
```

Or split out a `RAMPART_CRITICAL_RATIO` (e.g. 0.1 of the per-RCL target).

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

## 8. `remoteManager.tick` flips `scouted -> reserving` and `reserved -> building` on every tick, no transition guard

**Severity: Bug — Medium**
**Status: Fixed** — `src/managers/remoteManager.js` + `config/constants.js`.
A `statusTick` is recorded on every transition (via a new `setStatus`
helper) and a dwell-time guard reverts any non-terminal status stuck for
`REMOTE_STATE_STALE_TICKS` (5000) back to `pending`, so a failed scout
or reserver re-runs instead of stranding the entry in `reserving`.

`src/managers/remoteManager.js:183-192`:

```js
if (entry.status === 'scouted') {
    entry.status = 'reserving';
}

if (entry.status === 'reserved') {
    if ((entry.containerSiteIds || []).length === 0 && (entry.containerIds || []).length === 0) {
        queueConstruction(entry);
        entry.status = 'building';
    }
}
```

The `scouted -> reserving` transition runs unconditionally every tick
as long as status is `scouted`. There's a 1-tick window where the
reserver task hasn't dispatched yet, but the status is already
`reserving`. Then `taskReserve.run` checks `entry.status === 'reserving'`
to advance to `reserved` — this is correct, but the planner will
**never re-scout if the scout never arrived**: the moment the
`taskScout` writes `'scouted'`, the next `remoteManager.tick` flips it
to `'reserving'`. If the reserver then fails to spawn (e.g. no
spawn energy), the entry stays in `'reserving'` with `scoutedTick`
set but no `reservationExpires` — not picked up by the abandon check
at line 210 (which gates on `reserved` or `active`).

**Fix sketch.** Add a max dwell time per non-terminal state (e.g.
`scouted` for > 5000 ticks without promotion → revert to `pending` for
re-scout). Document the expected time per state in the plan.

---

## 9. `taskRemoteHaul.run` uses `routeCache.getNextStep` but falls back to `RoomPosition(25,25,targetRoom)` when no step exists

**Severity: Bug — Low**
**Status: Fixed** — `src/tasks/types/taskRemoteHaul.js`. When
`getNextStep` returns `null` (no route / findRoute returned ERR_NO_PATH),
the task now `return false` to release and let the scheduler re-evaluate
next tick instead of pathing across non-traversable terrain.

`src/tasks/types/taskRemoteHaul.js:49-53`:

```js
if (step) {
    const exitPos = creep.pos.findClosestByPath(step.exit);
    if (exitPos) move.moveCreep(creep, exitPos, ...);
} else {
    move.moveCreep(creep, { pos: { x: 25, y: 25, roomName: roomName } }, ...);
}
```

When `getNextStep` returns null (no cached route, `findRoute` returned
ERR_NO_PATH or empty), the fallback paths the creep straight to room
center. If the route is genuinely blocked (highway closed, blocked
by reservation), the creep will route across non-traversable terrain
forever. `moveCreep` will accumulate move failures and eventually
trigger `handleMoveFailures` (good), but until then the CPU is wasted
on pathing.

**Fix sketch.** When `getNextStep` returns null, release the task
(treat it as "route not available right now") and let the scheduler
re-evaluate next tick. Log once at warn level.

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

## 11. `taskReserve.run` keeps the creep in a holding pattern when the controller is contested but not the creep's own reservation

**Severity: Caveat — Medium**
**Status: Fixed** — `src/tasks/types/taskReserve.js:74-77`. The holding
branch now calls `move.action(creep, 'holding-reservation@<room>')` so
the reserver shows a live action label in the per-tick status log
instead of appearing idle. The `entry.status` race between reserver
flips is documented as benign (both writers write the same value).

`src/tasks/types/taskReserve.js:71-77`:

```js
if (reservation && reservation.username === me && reservation.ticksToEnd > 500) {
    entry.reservationExpires = Game.time + reservation.ticksToEnd;
    return true;
}
```

If `me` matches and timer is healthy, the creep does nothing. Good.
But it `return true` while standing still — `move.action` isn't called,
and `logger.setAction` is never set. The creep appears to idle in
the per-tick status log.

Also: if the reserver dies and a new one spawns mid-trip, the
already-claimed reservation may have decayed below 500 — the new
reserver walks in, tries to `reserveController`, but `entry.status`
might have been flipped to `contested` by another creep (see
`taskReserve.run:60-69`). The two status-write paths can race.

**Fix sketch.** Add an action label for "holding reservation"; the race
on `entry.status` between reserver flips is benign because both write
the same value, but document it.

---

## 12. `creepRunner.shouldSwitch` uses priority-only when an empty self-refueling creep's `best.priority < current.priority`

**Severity: Caveat — Medium**
**Status: Fixed** — `src/managers/creepRunner.js:241-252`. Dropped the
redundant `bestTask.type !== 'defend'` check (DEFEND is priority 10,
covered by `best.priority <= SUPPLY` (35)). The `heal` check is kept
because healers should switch to healing even when empty.

`src/managers/creepRunner.js:241-264`:

```js
if (best.priority < current.priority) {
    const energy = creep.store[RESOURCE_ENERGY] || 0;
    if (energy === 0 && SELF_REFUELING_TASKS[current.type] &&
        bestTask.type !== 'defend' && bestTask.type !== 'heal' &&
        !(bestTask.type === 'supply' && best.priority <= taskBase.PRIORITY.SUPPLY) &&
        !(bestTask.type === 'upgrade' && best.priority <= taskBase.PRIORITY.SUPPLY)) {
        return false;
    }
    return true;
}
```

The "supply" and "upgrade" priority checks use `<= taskBase.PRIORITY.SUPPLY`
(35), not the escalated priority. With the upgrade-escalation logic
(`taskUpgrade.priorityFor` returns 10/20/35/70 by ttd), the
`bestTask.priority` will be the **escalated** priority. The condition
`best.priority <= SUPPLY` covers `DEFEND (10)`, `RENEW (20)`,
escalated `UPGRADE (35)`, and `SUPPLY (35)`. Defenders with empty
energy would still need to switch to escalated upgrade. Looks right
but the `defend` early return is redundant with the priority check
since defend is always priority 10.

**Fix sketch.** Drop the `bestTask.type !== 'defend'` check (priority
comparison already handles it). Or document the redundancy.

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

## 14. `routeCache.getNextStep` returns `null` when the route is empty OR current room is the destination, conflating two cases

**Severity: Bug — Low**
**Status: Fixed** — `src/utils/routeCache.js`. `getNextStep` now returns
a `ROUTE_DONE` sentinel (`{ done: true }`) when the creep is already in
the destination room, distinct from `null` ("no route / blocked").
Callers (`taskRemoteHaul.run`) check `ROUTE_DONE` to stay put and
release on `null` instead of conflating the two. The existing test was
updated to assert `ROUTE_DONE` at destination; a new caller-side
behavior test was added in #9.

`src/utils/routeCache.js:48-58`:

```js
function getNextStep(from, to, currentRoomName) {
    const route = getRoute(from, to);
    if (!route || route.length === 0) return null;
    if (currentRoomName === to) return null;
    for (let i = 0; i < route.length; i++) {
        if (route[i].room === currentRoomName) return route[i];
    }
    return route[0];
}
```

A `null` return is treated as "fall back to room-center path" by callers
(see #9). But `null` also means "you're at the destination" or "route is
empty." Callers that hit the destination enter an infinite idle state
since `run()` returns `true` and the hauler is bound to a non-running
task. The `taskRemoteHaul.run` does `if (creep.pos.roomName === homeRoom)`
checks before calling `getNextStep` so this is partially mitigated, but
a `routeCache` of a path with no steps (e.g. `findRoute` returning an
empty array from a same-room call) will silently stick the creep.

**Fix sketch.** Differentiate: return `{done: true}` for "at destination"
and `{blocked: true}` for "no route." Or throw; or document and add a
caller-side check.

---

## 15. `creepManager.tick` calls `runCreep` for every creep even when the creep is `spawning`

**Severity: Caveat — Low**
**Status: Fixed** — `src/managers/creepRunner.js:573`. `runCreep` early
returns on `creep.spawning` so a spawning creep no longer spends a tick
of CPU on `ERR_BUSY` no-ops before the spawn finishes.

`src/managers/creepManager.js:111-119`:

```js
for (const name in Game.creeps) {
    try {
        runCreep(Game.creeps[name]);
    } catch (e) {
        ...
    }
}
```

`creepRunner.runCreep` first calls `renewOrRecycle(creep)` which calls
`creep.getActiveBodyparts(MOVE)` and `creep.body.length`. On a spawning
creep these are valid (the body is set even before spawn completes),
so this works. But `runIdleFallback` and `forceTargetFor` then
attempt to move, harvest, etc. with a spawning creep — the actions
return `ERR_BUSY` and the moveTo result is OK-but-blocked, but the
creep spends a tick of CPU on a no-op.

**Fix sketch.** Early return in `runCreep` on `creep.spawning`. Same
pattern as `stuckRecycleService`.

---

## 16. `global._terrainMap` and `global._structureMap` test globals leak across tests

**Severity: Caveat — Low**
**Status: Fixed** — `tests/mocks/screeps.js`. `resetMemory` now also
resets `global._terrainMap` and `global._structureMap` so a test that
mutates them after a `resetMemory` (without a prior `resetGame`) can't
leak state to the next test.

`tests/mocks/screeps.js:146-147`. The maps are reset in `resetGame` but
not in `resetMemory`. A test that mutates `_terrainMap` after resetting
memory will leave state behind. The current test suite happens to
always call `resetGame` before each test, but the order is not
documented.

**Fix sketch.** Reset both maps in `resetMemory` too.

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

## 20. `routeCache.writeCache` stores under `rr[to].routes[from]`, but the read function also looks at `rr[from].routes[to]`, leading to mirror writes

**Severity: Bug — Low**
**Status: Fixed** — `src/utils/routeCache.js`. `writeCache` now mirrors
the reverse route (with flipped exit constants via an `OPPOSITE_EXIT`
map) into `rr[from].routes[to]`, and `readCache` returns the mirrored
entry instead of signalling a recompute. The perpetual findRoute
recompute on every return trip is eliminated.

`src/utils/routeCache.js:29-34`:

```js
function writeCache(from, to, route) {
    ...
    rr[to].routes[from] = { route: route, tick: Game.time };
}
```

The read function (`readCache`) checks `rr[to].routes[from]` and
`rr[from].routes[to]` — but only `writeCache` is called by `getRoute`,
and it only writes the forward direction. The reverse-path branch in
`readCache` (lines 16-25) returns `null` to signal a recompute. Net
effect: a return-haul always re-runs `findRoute` once, then
`writeCache` is called with the new (reversed) direction, which
**overwrites** the original entry. So a round-trip cycle thrashes
the cache.

**Fix sketch.** In `writeCache`, write both directions:

```js
rr[to].routes[from] = { route, tick: Game.time };
const reverse = route.slice().reverse();
rr[from].routes[to] = { route: reverse, tick: Game.time };
```

(Or have `getRoute(from, to)` accept a `reverse` flag and skip
`findRoute` if the reverse is cached.)

---

## 21. `creepManager.tick` doesn't clear per-creep caches (`_bpCache`, `_lastMoveX/Y`) on `Game.time` change for creeps that were in the previous tick but not the current one

**Severity: Stylistic — Low**

Dying creeps leave their cache entries in `creep._bpCache` until GC.
The cache is a per-creep property, not a global map, so it doesn't
leak. After the creep dies, the next `Game.creeps` iteration skips
it, and the cache dies with the object. So this is fine.

**Fix sketch.** None.

---

## 22. `taskUpgrade.tasks` returns a single target `[controller]` for every room scan, even when the controller can't be upgraded (RCL 8)

**Severity: Caveat — Low**
**Status: Fixed** — `src/tasks/types/taskUpgrade.js:39-47`. The task
generator now returns `[]` when `room.controller.level >= 8`, so the
5-tick "try-upgrade, fail, blacklist, retry" cycle at RCL 8 is
eliminated.

`src/tasks/types/taskUpgrade.js:39-44`:

```js
tasks: function (room, _snap) {
    if (room.controller && room.controller.my) {
        return [{ target: room.controller }];
    }
    return [];
}
```

At RCL 8 the controller can no longer be upgraded, but the task still
emits a target. `creep.upgradeController` will return
`ERR_INVALID_TARGET` and the task `run` returns `false`, which
black-lists the task for 5 ticks. After 5 ticks it re-emits and re-fails.
Net: 5-tick cycles of "try-upgrade, fail, black-list, retry."

**Fix sketch.** Return `[]` when `room.controller.level >= 8`.

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

## 25. `creepRunner` blacklist TTL of 5 ticks is not configurable

**Severity: Caveat — Low**
**Status: Fixed** — `src/managers/creepRunner.js`. A `blacklistTtlFor(type)`
helper now returns 10 for `haul`/`remoteHaul`/`sweep` (longer window so a
container that just emptied isn't immediately re-picked) and 5 for
everything else. The move-failure path keeps its 50-tick TTL.

`src/managers/creepRunner.js:690`:

```js
memory.addFailedTask(creep, assigned.id, 5);
```

The 5-tick TTL is hard-coded. Some task types (hauling) would benefit
from a longer blacklist to avoid re-picking a container that just
emptied. The `handleMoveFailures` path uses 50 ticks
(`addFailedTask(..., 50)`) for move-failure-driven releases.

**Fix sketch.** Add a `blacklistTtlFor(type)` lookup, default 5, override
to 50 for move-failure cases (already done at line 417), 10 for
sweep/haul.

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

## 28. `intelService.tick` decouples scan from record: scanned rooms that aren't yet visible stay in `_pendingScans` and get re-recorded on the next visibility

**Severity: Caveat — Medium**
**Status: Fixed** — `src/managers/upkeep/intelService.js`. The scan
loop now dedups against the existing `_pendingScans` list (via an
`alreadyPending` map) before pushing, so a slow-to-become-visible room
isn't scanned repeatedly before its first observation is recorded.

`src/managers/upkeep/intelService.js:131-160`. A scanned room
becomes visible 1 tick later; meanwhile a new scan is started (cursor
advances). If the room takes > 1 tick to become visible (observer
async, or visibility blocked), the room is scanned again before the
first observation is recorded. The second scan overwrites
`_pendingScans[roomName]` (the entry is pushed, not replaced, so
both stay in the array). When the room becomes visible, both are
processed — `recordIntel` runs twice for the same room on the same
tick (or two consecutive ticks), which is idempotent but wastes work.

**Fix sketch.** Dedup `_pendingScans` by roomName before adding:
`if (!intel._pendingScans.includes(name)) intel._pendingScans.push(name);`
or use a `Set`.

---

## 29. `squadManager.tick` sets `squads[sid].status` AFTER `runSquad` has run, but the re-pair-on-leader-loss path mutates `entry.leader` and `squads[sid]` outside the entry

**Severity: Bug — Medium**
**Status: Fixed** — `src/managers/squadManager.js` +
`config/constants.js`. A per-fighter pairing lock
(`Memory._squadPairingLocks`, TTL `SQUAD_PAIRING_LOCK_TICKS` = 5) is
checked before accepting a `findUnpairedFighter` candidate, so two
squads' re-pair paths can no longer race on the same fighter. Locks are
pruned each tick.

`src/managers/squadManager.js:142-153`:

```js
if (!entry.leader && entry.medic) {
    const spawnManager = require('./spawnManager');
    const newLeader = spawnManager.findUnpairedFighter();
    if (newLeader) {
        memory.setSquadId(newLeader, sid);
        memory.setSquadRole(newLeader, 'leader');
        entry.leader = newLeader;
        squads[sid].leaderId = newLeader.id;
        squads[sid].status = 'active';
    } else {
        squads[sid].status = 'broken';
    }
}
```

`findUnpairedFighter` excludes fighters with `squadLeader` set in
healer memory. But the **new** medic we're pairing is already on this
squad, and its `squadLeader` is set to a now-dead fighter. The new
leader must be unpaired from a healer — and the new leader could be
**the one we're about to assign to this very squad**, which is fine
because we then update its memory. But `findUnpairedFighter` returns
"newest unpaired fighter" — if the new leader has the highest
`ticksToLive` among unpaired, this is correct. If another squad
already has a medic waiting for a leader, the re-pair races with that
squad's re-pair. Both squads call `setSquadId(newLeader, sid)` for the
same fighter; last writer wins.

**Fix sketch.** Acquire-lock the re-pair: write `entry._repaired = true`
and check before calling `findUnpairedFighter`. Or claim via a per-squad
mutex stored on `Memory._squadPairingLock` with a TTL.

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

## 31. `creepManager` summary log shows `unknown` for creeps with no role

**Severity: Caveat — Low**
**Status: Fixed** — `src/managers/creepManager.js:23-39`. The summary
loop now runs the same name-based role inference `runCreep` does, so a
freshly-spawned creep is counted under its real role instead of
`unknown`.

`src/managers/creepManager.js:30`:

```js
const r = memory.getRole(cr) || 'unknown';
```

`runCreep` infers role from name if missing. But the summary is built
**before** `runCreep` runs. Creeps in the same tick they spawn are
counted as `unknown`. Cosmetic, not a bug.

**Fix sketch.** Run inference in the summary loop too.

---

## 32. `expansionPlanner.tick` is bucket-gated to `> 5000` even when the only candidate room is immediately the player's own claim target

**Severity: Caveat — Low**
**Status: Fixed** — `src/managers/expansionPlanner.js:163`. The bucket
gate dropped from 5000 to 1000 to match the rest of the manager chain,
so the planner isn't starved during heavy combat and can still place a
veto-window flag in time.

`src/managers/expansionPlanner.js:163`. The veto window is 1000 ticks.
With the bucket gate at 5000, the planner can be starved during heavy
combat and miss the veto window. The flag is still placed; the
planner just doesn't run, so the expansion doesn't proceed.

**Fix sketch.** Drop the bucket gate to `> 1000` (matches the rest of
the manager chain) and rely on the small per-tick cost.

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

## 35. `linkService.runLink` only fires when the link is a "source link" (near a source), but the controller link and storage link are never themselves filled

**Severity: Caveat — Medium (semantic)**
**Status: Fixed** — `src/managers/upkeep/linkService.js`. The transfer
threshold lowered from 50 to 10 so a source link with 49 energy still
tops up the controller link. The previous 50 threshold let the
controller link starve even when storage was full. The test was
updated to assert the new low-energy transfer behavior.

`src/managers/upkeep/linkService.js:24-25`:

```js
if (!isSourceLink(link, sources)) return;
```

So the **controller link and storage link** are never the active
link in `runLink`. They're only filled by the source-link transfer.
The result: a source link with 49 energy (below the `50` threshold)
will not trigger a transfer, and the controller link starves even
when storage is full.

**Fix sketch.** Reduce the threshold or have the source link transfer
even at 30 energy to keep the controller link topped up.

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

## 37. `pathScore` cache in `taskBase.pathScore` is unbounded

**Severity: Bug — Low**
**Status: Fixed** — `src/tasks/taskBase.js` + `config/constants.js`. A
`PATH_SCORE_MAX_ENTRIES` (2000) hard cap was added; when exceeded, an
`evictOldestPathScores` helper drops the oldest-by-`time` entries. The
existing periodic TTL cleanup is still the primary eviction path; the
hard cap is the defense against unbounded growth during a Game.time
jump or a large creep count.

`src/tasks/taskBase.js:69-102`. `_pathScoreCache` is module-scoped and
only cleaned up every `PATH_SCORE_CLEANUP_INTERVAL` (50) ticks. With
many creeps, the cache can hold 1000+ entries between cleanups. A
periodic cleanup is in place, but if `Game.time` jumps (e.g. shard
switch or `Memory._warmup`), the cache can hold stale entries forever.

**Fix sketch.** Move the cache to `Memory.pathScoreCache` (size-bounded
by `MAX_PERIODIC_KEYS` like the logger) and rebuild on tick.

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

## 42. `safeModeService` does not log when `controller.safeModeCooldown > 0` (the cooldown is silent)

**Severity: Caveat — Low**
**Status: Fixed** — `src/managers/upkeep/safeModeService.js`. When safe
mode is needed but blocked by cooldown, a one-time log per room per
cooldown window is emitted ("blocked by cooldown=N (need ttd=X /
spawn-low)"), so a player watching the console sees why activation
didn't fire. The log flag (`_safeModeCooldownLogged`) is cleared on
successful activation.

`src/managers/upkeep/safeModeService.js:38-40`. The cooldown gates
silently. A player watching the console won't know why safe mode
isn't activating. The `console.log` at line 46 only fires on the
periodic 100-tick failure path.

**Fix sketch.** Add a one-time log when safe mode is needed but
blocked by cooldown, gated on `safeModeCooldown > 0 && first time`.

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

## 44. `taskSupply.tasks` includes every spawn/extension in the snapshot, but spawns may have just spawned a creep and have 0 free capacity, and they're not filtered

**Severity: Caveat — Low**
**Status: Fixed** — `src/tasks/types/taskSupply.js:37-52`. The task
generator now skips a spawn with `< 50` energy when its capacity is
`>= 50`, so a 0/300 spawn no longer wins every supply task and forces
1-energy trips while near-full extensions are ignored. Once the spawn
climbs above 50 (via idle-deposit fallback) it competes normally.

`src/tasks/types/taskSupply.js:42-44`:

```js
if ((s.store[RESOURCE_ENERGY] || 0) < (s.store.getCapacity(RESOURCE_ENERGY) || 0)) {
    out.push({ target: s });
}
```

A spawn with `energy: 0, energyCapacity: 300` is included. The supply
creep walks to the spawn, transfers 1 energy, the spawn is at 1/300
still. Cap=300, never full. The spawn is `isFull` after 299 more
energy. Until then, every supply creep will pick this spawn first
because of the low-priority DEPOSIT_PRIORITY of 1 (the lowest number
= highest priority in `scoreDeposit`'s `priority * 1000`).

This is by design (spawn first), but if the spawn is at 0/300 and
another extension is at 200/200, the supply creep will deliver
1 to the spawn, then walk to the extension, then deliver 200. 200
deliveries later, the spawn is finally "full enough" and the next
supply creep skips it. Net: 200 inefficient trips.

**Fix sketch.** Either don't emit a supply task for a spawn with
`< 50` energy (so the supply creep picks a higher-priority target),
or weight the spawn's `free` energy gap so a near-full spawn wins
ties with a near-empty extension.

---

## 45. `taskSweep.run` returns `false` after a successful deposit, forcing a re-evaluation. With many small drops, this thrashes

**Severity: Caveat — Low**
**Status: Fixed** — `src/tasks/types/taskSweep.js:84-99`. For a
tombstone/ruin with more resources remaining after a partial withdraw,
the task now `return true` to keep the creep bound to the same target
next tick (mirrors the hauler fix from efficiency-audit #4). Dropped
resources are single-tile single-resource, so they still release on
completion.

`src/tasks/types/taskSweep.js:62-64`. The efficiency-audit item #4
applied the equivalent fix to `taskHaul` (kept the task across
deliveries), but `taskSweep` still releases after each deposit. The
hauler fix is intentional: a hauler should keep hauling from the same
container. For sweepers, the next pick is usually a different target
(a different dropped pile), so the release is fine. But for tombstones
with multi-resource stores, a partial withdraw should keep the task
(there's more to withdraw).

**Fix sketch.** Mirror the hauler fix: if `t` is a tombstone/ruin with
more remaining resources, keep the task.

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

## 48. `creepRunner.handleMoveFailures` releases the task on move-failure unless the task is `harvest` and the creep is already within 3 tiles of the target. This blocks `mine` and `remoteMine` from triggering stuck-release even when stuck.

**Severity: Caveat — Low**
**Status: Fixed** — `src/managers/creepRunner.js:413-420`. The
source-proximate carve-out now covers `mine` and `remoteMine` in
addition to `harvest`, so a stuck miner retries next tick instead of
taking ~50 ticks to release and walk home.

`src/managers/creepRunner.js:412-420`. The carve-out for `harvest`
exists because miners walk to sources repeatedly. But for `mine`,
the slot is `exactTile: true` (line 65 of `taskMine.js`), and a stuck
miner should also release. A miner with a `taskMine` assignment
that's been failing to move for > 5 ticks will log `[unreachable]` but
NOT release the task. The miner will keep trying for 5 more ticks
before the next attempt. Net: a stuck miner takes 50 ticks to walk
home instead of 5.

**Fix sketch.** Extend the carve-out to all source-proximate tasks
(`mine`, `remoteMine`, `harvest`).

---

## 49. `remoteManager.updateThreats` flips `entry.status = 'contested'` on any non-empty hostiles array, but a passing scout doesn't justify abandoning the reservation

**Severity: Bug — Medium**
**Status: Fixed** — `src/managers/remoteManager.js:110-131`. The flip
now requires either an armed hostile (any ATTACK / RANGED_ATTACK / HEAL
/ WORK bodypart) or 2+ hostiles of any kind. A lone unarmed invader
scout no longer triggers `contested` and the 2-fighter + 1-healer
spawn thrash. A test for the unarmed-scout case was added.

`src/managers/remoteManager.js:110-116`:

```js
if (hostiles.length > 0) {
    entry.status = 'contested';
} else if (entry.status === 'contested') {
    const lastThreat = entry.threats.length > 0 ? entry.threats[entry.threats.length - 1].detectedTick : Game.time;
    if (Game.time - lastThreat > 100) entry.status = 'active';
}
```

The `'contested'` status triggers `q.fighter = 2, q.healer = 1` in
`creepsQuotas.remoteRoleQuotas` (line 55-57). A single invader core
"scout" passing through marks the room contested, spawns 2 fighters +
1 healer (assuming the budget allows), and burns resources for a
non-event. The 100-tick clear delay doesn't fix the false-positive.

**Fix sketch.** Require `hostiles.length >= CONTEST_THRESHOLD` (e.g.
2+) and/or `hostileOwner !== 'Invader'` to flip to `contested`.

---

## 50. `moveUtil.moveCreep` reads `creep.room.lookForAt(LOOK_STRUCTURES, creep.pos.x, creep.pos.y)` on every call to check for a road

**Severity: Bug — Low (CPU)**
**Status: Fixed** — `src/utils/moveUtil.js:50-57`. The self-tile road
check is cached per creep per tick on `creep._onRoad` / `creep._onRoadTick`
(similar to `_bpCacheTick`), eliminating the per-`moveTo` `lookForAt`
self-tile lookup. The target-tile check still runs per call (it varies
with the target), but the self-tile is the hot path for stable
hauler/miner loops.

`src/utils/moveUtil.js:50-52`. For each `moveTo` call (once per creep
per tick), this is a `lookForAt` on the room. Cheap individually,
but with 50 creeps × 1 = 50 lookups per tick. The result is used to
decide `reusePath`; the answer is "yes" or "no." Cache the result
per (creep, tile) for the tick (or just per creep — most creeps stay
on roads once they enter them).

**Fix sketch.** Set a `creep._onRoad` flag in the shim that
`creepManager.runCreep` installs (similar to `_bpCacheTick`).

---

## Summary by severity

- **High (5):** #1, #2, #6, #20, #29 — **all fixed**
- **Medium (12):** #3, #8, #9, #11, #12, #14, #22, #28, #35, #39, #44, #48, #49
  — **fixed: #3, #8, #11, #12, #14, #22, #28, #35, #48, #49, #9**
  · open: #39 (terminal snapshot — blocked on `plans/market.md`)
- **Low / Caveat / Stylistic (33):**
  - **Fixed:** #15, #16, #25, #31, #32, #37, #42, #44, #45, #50
  - **By design / false alarm / no fix needed:** #5, #7, #10, #13, #17,
    #18, #19, #21, #23, #24, #26, #27, #30, #33, #34, #36, #38, #40,
    #41, #43, #46, #47 — see each entry's "Fix sketch" line.

## Recommended fix order

1. ~~**#1 (nearestSpawn fall-through)** — affects every combat/renew path.~~ ✅
2. ~~**#6 (rampart critical threshold)** — high-RCL defense correctness.~~ ✅
3. ~~**#20 (routeCache mirror)** — fixes a CPU leak in remote hauling.~~ ✅
4. ~~**#29 (squad re-pair race)** — defense correctness.~~ ✅
5. ~~**#2 + #48 (taskMine stuck/claim race)** — economy efficiency.~~ ✅
6. ~~**#8 (remoteManager stuck state)** — remote pipeline reliability.~~ ✅
7. ~~**#49 (contested false-positive)** — defender spawn thrash.~~ ✅
8. ~~**#9 + #14 (remoteHaul + routeCache null)** — route leak + null
   conflation.~~ ✅
9. ~~**#3 (taskMine CARRY guard)** — dormancy guard for future body
   templates.~~ ✅
10. ~~**#22 (RCL 8 upgrade task)** — 5-tick fail-churn elimination.~~ ✅
11. ~~**#28 (intelService dedup)** — wasted re-scan elimination.~~ ✅
12. ~~**#35 (link threshold)** — controller-link starvation fix.~~ ✅
13. ~~**#37 (pathScore cache bound)** — unbounded-growth defense.~~ ✅
14. ~~**#11, #12, #25, #31, #32, #42, #44, #45, #50** — opportunistic
    polish batch.~~ ✅
15. ~~**#15, #16** — test/no-op-cost polish.~~ ✅
16. **Remaining open:** #39 (terminal snapshot) — blocked on
    `plans/market.md`; revisit when market work starts.
