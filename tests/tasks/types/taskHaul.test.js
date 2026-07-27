'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../../mocks/screeps');
const memory = require('../../../src/utils/memorySchema');
const taskHaul = require('../../../src/tasks/types/taskHaul');

// RCL 3 transition guard: when miners have just spawned and containers aren't
// filled yet, haulers assigned to an empty container must release the task
// (return false) rather than getting stuck on it. creepRunner blacklists the
// released task for ~5 ticks so the hauler re-selects a different target next
// tick and eventually falls through to runIdleFallback if no work exists.

test('haul with an empty container and empty creep releases the task gracefully', function () {
    mocks.resetGame();
    const container = mocks.mockStructure(STRUCTURE_CONTAINER, {
        id: 'cont1', pos: { x: 25, y: 25, roomName: 'W1N1' },
        energy: 0, capacity: 2000,
    });
    const hauler = mocks.mockCreep({
        name: 'Hauler1-Spawn1', pos: { x: 26, y: 25, roomName: 'W1N1' },
        capacity: 100, store: {}, parts: { carry: 2, move: 2 },
    });
    memory.setRole(hauler, 'hauler');
    const snap = { energyStructures: [], containers: [container], storage: null, links: [], sources: [] };
    const result = taskHaul.run(hauler, { target: container }, snap);
    assert.equal(result, false);
});