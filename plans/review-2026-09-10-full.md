# Code Review — 2026-09-10 (Full)

Status: **3 subagent review complete** — 22 bugs found across 3 domains.
Baseline: 339/0 tests, 0 lint errors, `dist/main.js` parses clean.

## Summary by severity

| Severity | Count | Domains |
|----------|-------|---------|
| P0 | 0 | — |
| P1 | 5 | planning (2), tasks (2), defense (1) |
| P2 | 8 | managers (1), tasks (5), planning (2) |
| P3 | 9 | managers (2), tasks (3), planning (3), config (3) |
| **Total** | **22** | |

## P1 — High (should fix soon)

### P1-A — `plannerUtils.isTileAvailable` treats roads as blocking (false negative)
- **File:** `src/planning/plannerUtils.js:33-36`
- **Impact:** Extension/storage/tower/link placement skips valid tiles that already have roads. Forces structures into suboptimal positions farther from anchor.
- **Fix:** Filter structures to only blocking types before checking length. Roads/containers should not make a tile unavailable.

### P1-B — `roadStrategy.addRoad` same false negative — skips tiles with any structure
- **File:** `src/planning/strategies/roadStrategy.js:27-28`
- **Impact:** Road paths through base cluster have gaps wherever they cross existing structures. Creeps walk on plains/swamps in base.
- **Fix:** Only skip tiles with blocking structures. Roads can coexist with almost all structures.

### P1-C — `taskHaul.run` collection phase hardcoded to RESOURCE_ENERGY
- **File:** `src/tasks/types/taskHaul.js:84-86`
- **Impact:** If a hauler carries a mineral (from task switching), it can deliver it but can never collect more. The `resourceType` detection at line 44-50 is dead code for the collection path.
- **Fix:** Withdraw the detected `resourceType` instead of hardcoded `RESOURCE_ENERGY`, or document haul as energy-only.

### P1-D — `depositService.findDeposit` non-energy path returns unsorted first candidate
- **File:** `src/services/depositService.js:41-61`
- **Impact:** Mineral haulers always deposit to storage even if a terminal 20 tiles closer has space.
- **Fix:** Sort candidates by `scoreDeposit` like the energy path does.

### P1-E — Extensions unprotected by ramparts (defense gap)
- **File:** `src/planning/strategies/rampartStrategy.js:9-14`
- **Impact:** At RCL6 with 40 extensions, a single ranged attack wave can destroy the entire energy infrastructure. Test confirms this is "user decision" but it's a significant defense vulnerability.
- **Fix:** Add `STRUCTURE_EXTENSION` back to `CRITICAL_TYPES`. Budget (45 at RCL6) covers it.

## P2 — Medium (fix when convenient)

| # | File | Bug |
|---|------|-----|
| 1 | `creepRunner.js:155-161` | `depositAvailable` doesn't filter source containers, diverging from `findDeposit` — hauler soft-lock |
| 2 | `creepsQuotas.js:223` | `haulerPathDistance` uses Chebyshev not real path length — under-provisioned haulers |
| 3 | `creepsQuotas.js:196-198` | `sourceHasLinkDeposit` checks source center not claimed slot — energy drops if link on far side |
| 4 | `taskHaul.js:61` | Delivery trigger checks container energy even for mineral hauls |
| 5 | `creepsQuotas.js:324-326` | Hauler quota zeroed during miner respawn window — double-death gap |
| 6 | `taskSweep.js:47` | `getFreeCapacity()` without resource type — multi-resource edge case |
| 7 | `containerStrategy.js:38-40` | Container budget wasted at RCL5+ when source links supersede containers |
| 8 | `terminalService.js:64-83` | Missing `resourceType` validation — silent failure on typo |

## P3 — Low (cleanup)

| # | File | Bug |
|---|------|-----|
| 1 | `cartographer.js:39-42` | `dequeue` never called — intel queue is dead code |
| 2 | `labsService.js:81` | `const room = Game.rooms` — dead/misleading line |
| 3 | `taskMine.js:35` | Depleted source check fragile for undefined energy |
| 4 | `taskDistributor.js:47-68` | Potential duplicate tasks if energyStructures ever includes storage |
| 5 | `creepsQuotas.js:239` | Hardcoded RCL→capacity map can drift from game |
| 6 | `moveUtil.js:128-135` | Creep-avoidance heuristic misfire for horizontal lines |
| 7 | `constants.js:20` | `RAMPART_TARGET_HITS` dead code |
| 8 | `linkService.js:4` | `LINK_LOSS_RATIO` imported but unused |
| 9 | `labsService.js:49,69` | `snap.labs`/`snap.terminal` never populated in roomManager |

## Tests asserting wrong behavior

| # | File | Issue |
|---|------|-------|
| 1 | `routeCache.test.js:10,24,35,45` | Tests use `Memory.remoteRooms` but code uses `Memory.routeCache` — tests pass but don't test the cache |
| 2 | `constructionPlanner.test.js:90-101` | Test asserts extensions are NOT rampart-protected (confirms arguably-wrong behavior) |

## Untested critical paths

| Path | Severity |
|------|----------|
| 6 planning strategies (extension, link, container, road, storage, tower) | P1 |
| `plannerUtils.isTileAvailable` / `findPositionNear` | P1 |
| `routeCache.readCache/writeCache` | P2 |
| `assert.safeRun` error boundary | P2 |
| `spawnUtil.nearestSpawn` foreign-room fallback | P3 |

## Recommended fix order

1. **P1-A + P1-B** — fix `isTileAvailable` and `roadStrategy` to not block on roads (biggest impact on base layout)
2. **P1-D** — sort mineral deposit candidates by score
3. **P1-C** — decide: haul is energy-only or support minerals in collection
4. **P2-1** — fix `depositAvailable` source-container filter (soft-lock prevention)
5. **P2-3** — fix `sourceHasLinkDeposit` to check slot proximity
6. **P1-E** — decide on extension ramparts (user call)
7. Test fixes: `routeCache.test.js` namespace, strategy tests
8. P3 cleanup pass