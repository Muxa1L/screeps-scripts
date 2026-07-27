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

// --- Tower role-priority targeting ---

function hostileMock(opts) {
    const c = mocks.mockCreep({
        name: opts.name,
        pos: opts.pos,
        parts: opts.parts,
    });
    c.id = opts.id;
    c.hits = opts.hits || 1000;
    c.hitsMax = opts.hitsMax || 1000;
    return c;
}

test('hostileThreatTier classifies healers, ranged, melee, and scouts', function () {
    assert.equal(towerService.hostileThreatTier(hostileMock({ name: 'h', parts: { heal: 2, move: 2 } })), 0);
    assert.equal(towerService.hostileThreatTier(hostileMock({ name: 'h', parts: { ranged_attack: 2, move: 2 } })), 1);
    assert.equal(towerService.hostileThreatTier(hostileMock({ name: 'h', parts: { attack: 2, move: 2 } })), 2);
    assert.equal(towerService.hostileThreatTier(hostileMock({ name: 'h', parts: { move: 2 } })), 3);
    // A hybrid healer+anything is still tier 0 (healers die first).
    assert.equal(towerService.hostileThreatTier(hostileMock({ name: 'h', parts: { heal: 1, attack: 3, move: 4 } })), 0);
    // A hybrid ranged+melee (no heal) is tier 1 (ranged outranks melee).
    assert.equal(towerService.hostileThreatTier(hostileMock({ name: 'h', parts: { ranged_attack: 1, attack: 3, move: 4 } })), 1);
});

test('pickHostileTarget prefers a healer over a closer attacker', function () {
    mocks.resetGame();
    const towerPos = mocks.makePos(pos(25, 25));
    const healer = hostileMock({ id: 'healer1', name: 'Healer', pos: pos(28, 25), parts: { heal: 2, move: 2 } });
    const attacker = hostileMock({ id: 'attacker1', name: 'Attacker', pos: pos(26, 25), parts: { attack: 3, move: 3 } });
    const picked = towerService.pickHostileTarget(towerPos, [attacker, healer]);
    assert.equal(picked.id, 'healer1');
});

test('pickHostileTarget uses distance as a tiebreaker within a tier', function () {
    mocks.resetGame();
    const towerPos = mocks.makePos(pos(25, 25));
    const near = hostileMock({ id: 'near', name: 'Near', pos: pos(26, 25), parts: { attack: 3, move: 3 } });
    const far = hostileMock({ id: 'far', name: 'Far', pos: pos(40, 25), parts: { attack: 3, move: 3 } });
    const picked = towerService.pickHostileTarget(towerPos, [far, near]);
    assert.equal(picked.id, 'near');
});

test('runTower attacks the healer before the closer attacker', function () {
    mocks.resetGame();
    const tower = mocks.mockStructure(STRUCTURE_TOWER, {
        id: 'tower1',
        pos: pos(25, 25),
        energy: 800,
        energyCapacity: 1000,
    });
    let attackedId = null;
    tower.attack = function (t) { attackedId = t.id; return OK; };
    const healer = hostileMock({ id: 'healer1', name: 'Healer', pos: pos(28, 25), parts: { heal: 2, move: 2 } });
    const attacker = hostileMock({ id: 'attacker1', name: 'Attacker', pos: pos(26, 25), parts: { attack: 3, move: 3 } });
    const origGet = roomManager.get;
    roomManager.get = function () {
        return { hostiles: [healer, attacker], damagedFriendlies: [], repairTargets: [] };
    };
    try {
        towerService.runTower(tower);
        assert.equal(attackedId, 'healer1');
    } finally {
        roomManager.get = origGet;
    }
});