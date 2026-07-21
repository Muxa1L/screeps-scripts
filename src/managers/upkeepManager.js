const assert = require('../utils/assert');
const constructionPlanner = require('../planning/constructionPlanner');
const towerService = require('./upkeep/towerService');
const linkService = require('./upkeep/linkService');
const safeModeService = require('./upkeep/safeModeService');
const memoryCleanupService = require('./upkeep/memoryCleanupService');
const stuckRecycleService = require('./upkeep/stuckRecycleService');
const watchdogService = require('./upkeep/watchdogService');

function runStructures() {
    // Single pass over Game.structures; dispatch towers and links in one
    // iteration instead of two full scans. Per-structure safeRun keeps the
    // per-service error labels ('towers' / 'links') and isolates failures.
    for (const name in Game.structures) {
        const s = Game.structures[name];
        if (!s.structureType) continue;
        if (s.structureType === STRUCTURE_TOWER) {
            assert.safeRun('towers', function () { towerService.runTower(s); });
        } else if (s.structureType === STRUCTURE_LINK) {
            if (s.cooldown > 0) continue;
            assert.safeRun('links', function () { linkService.runLink(s); });
        }
    }
}

function run() {
    assert.safeRun('constructionPlanner', function () {
        for (const rn in Game.rooms) {
            const r = Game.rooms[rn];
            if (!r.controller || !r.controller.my) continue;
            constructionPlanner.tick(r);
        }
    });

    assert.safeRun('structures', runStructures);
    assert.safeRun('safeMode', safeModeService.runSafeMode);
    assert.safeRun('creepMemoryCleanup', memoryCleanupService.runMemoryCleanup);
    assert.safeRun('stuckRecycle', stuckRecycleService.runStuckRecycle);
    assert.safeRun('memoryWatchdog', watchdogService.runWatchdog);
}

module.exports = {
    run: run,
};
