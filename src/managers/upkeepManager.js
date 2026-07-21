const assert = require('../utils/assert');
const constructionPlanner = require('../planning/constructionPlanner');
const towerService = require('./upkeep/towerService');
const linkService = require('./upkeep/linkService');
const safeModeService = require('./upkeep/safeModeService');
const memoryCleanupService = require('./upkeep/memoryCleanupService');
const stuckRecycleService = require('./upkeep/stuckRecycleService');
const watchdogService = require('./upkeep/watchdogService');

function runTowers() {
    for (const name in Game.structures) {
        const s = Game.structures[name];
        if (!s.structureType) continue;
        if (s.structureType === STRUCTURE_TOWER) {
            towerService.runTower(s);
        }
    }
}

function runLinks() {
    for (const lname in Game.structures) {
        const link = Game.structures[lname];
        if (!link.structureType || link.structureType !== STRUCTURE_LINK) continue;
        if (link.cooldown > 0) continue;
        linkService.runLink(link);
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

    assert.safeRun('towers', runTowers);
    assert.safeRun('links', runLinks);
    assert.safeRun('safeMode', safeModeService.runSafeMode);
    assert.safeRun('creepMemoryCleanup', memoryCleanupService.runMemoryCleanup);
    assert.safeRun('stuckRecycle', stuckRecycleService.runStuckRecycle);
    assert.safeRun('memoryWatchdog', watchdogService.runWatchdog);
}

module.exports = {
    run: run,
};
