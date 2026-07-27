'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../../mocks/screeps');
const constants = require('../../../src/config/constants');
const roomManager = require('../../../src/managers/roomManager');
const towerService = require('../../../src/managers/upkeep/towerService');

function pos(x, y) {
    return { x: x, y: y, roomName: 'W1N1' };
}

test('rampartTargetFor scales with RCL and clamps unknown RCLs to max', function () {
    assert.equal(constants.rampartTargetFor(3), 10000);
    assert.equal(constants.rampartTargetFor(4), 50000);
    assert.equal(constants.rampartTargetFor(5), 100000);
    assert.equal(constants.rampartTargetFor(6), 250000);
    assert.equal(constants.rampartTargetFor(7), 500000);
    assert.equal(constants.rampartTargetFor(8), 1000000);
    // Unknown RCL clamps to the highest known value.
    assert.equal(constants.rampartTargetFor(99), 1000000);
    assert.equal(constants.rampartTargetFor(0), 1000000);
});

test('runTower repairs the closest snapshot repairTarget instead of scanning room.find', function () {
    mocks.resetGame();
    const tower = mocks.mockStructure(STRUCTURE_TOWER, {
        id: 'tower1',
        pos: pos(25, 25),
        energy: 800,
        energyCapacity: 1000,
    });
    // Damaged wall at distance 1, damaged road at distance 5.
    const wall = mocks.mockStructure(STRUCTURE_WALL, { id: 'w1', pos: pos(26, 25), hits: 5000, hitsMax: 10000 });
    const road = mocks.mockStructure(STRUCTURE_ROAD, { id: 'r1', pos: pos(30, 25), hits: 1000, hitsMax: 5000 });
    let repairedId = null;
    tower.repair = function (t) { repairedId = t.id; return OK; };
    // Inject a snapshot that already has repairTargets pre-filtered by the
    // room manager. The tower should pick from this list, not call
    // findClosestByRange(FIND_STRUCTURES).
    const origGet = roomManager.get;
    roomManager.get = function () {
        return { hostiles: [], damagedFriendlies: [], repairTargets: [wall, road] };
    };
    try {
        towerService.runTower(tower);
        assert.equal(repairedId, 'w1'); // wall is closer (dist 1 vs 5)
    } finally {
        roomManager.get = origGet;
    }
});