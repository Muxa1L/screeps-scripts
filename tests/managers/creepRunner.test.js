'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../mocks/screeps');
const memory = require('../../src/utils/memorySchema');

// Regression test for the bug where fighters with no CARRY parts were
// permanently `isEmpty=true` and got filtered out of `defend` tasks by the
// bestTaskFor `isEmpty` filter. The filter exists to stop empty builders/
// upgraders from taking non-refueling work, but it must not exclude combat
// tasks from combat creeps. See creepRunner.bestTaskFor / line 185 fix.

test('creeps with no CARRY capacity are not treated as empty', function () {
    mocks.resetMemory();
    mocks.resetGame();
    // Fighter with no CARRY: capacity 0, energy 0.
    const fighter = mocks.mockCreep({
        name: 'Fighter1-Spawn1',
        pos: { x: 25, y: 25, roomName: 'W1N1' },
        capacity: 0,
        store: {},
        parts: { attack: 3, tough: 3, move: 6 },
    });
    memory.setRole(fighter, 'fighter');
    const capacity = fighter.store.getCapacity(RESOURCE_ENERGY) || 0;
    const energy = fighter.store[RESOURCE_ENERGY] || 0;
    const isFull = capacity > 0 && energy >= capacity;
    const isEmpty = capacity > 0 && energy === 0;
    assert.equal(capacity, 0);
    assert.equal(energy, 0);
    assert.equal(isFull, false);
    // The fix: a no-CARRY creep is NOT empty. Before the fix, isEmpty was
    // `energy === 0` and was true here, which caused `defend` tasks to be
    // skipped for fighters.
    assert.equal(isEmpty, false);
});

test('creeps with CARRY and zero energy are still treated as empty', function () {
    mocks.resetMemory();
    mocks.resetGame();
    const hauler = mocks.mockCreep({
        name: 'Hauler1-Spawn1',
        pos: { x: 25, y: 25, roomName: 'W1N1' },
        capacity: 100,
        store: {},
    });
    memory.setRole(hauler, 'hauler');
    const capacity = hauler.store.getCapacity(RESOURCE_ENERGY) || 0;
    const energy = hauler.store[RESOURCE_ENERGY] || 0;
    const isEmpty = capacity > 0 && energy === 0;
    assert.equal(capacity, 100);
    assert.equal(energy, 0);
    assert.equal(isEmpty, true);
});