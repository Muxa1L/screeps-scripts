'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../../mocks/screeps');
const taskSupply = require('../../../src/tasks/types/taskSupply');
const taskBase = require('../../../src/tasks/taskBase');

function pos(x, y) {
    return { x: x, y: y, roomName: 'W1N1' };
}

function makeEnergyStructure(id, p, energy, capacity) {
    return mocks.mockStructure(STRUCTURE_EXTENSION, {
        id: id, pos: p, energy: energy, capacity: capacity || 100,
    });
}

test('canDo requires CARRY parts', function () {
    mocks.resetGame();
    const ok = mocks.mockCreep({ parts: { carry: 1 } });
    const none = mocks.mockCreep({ parts: { work: 1 } });
    assert.equal(taskSupply.canDo(ok), true);
    assert.equal(taskSupply.canDo(none), false);
});

test('tasks includes only non-full energy structures and excludes towers', function () {
    mocks.resetGame();
    const ext = makeEnergyStructure('ext1', pos(10, 10), 0, 100);
    const fullExt = makeEnergyStructure('ext2', pos(11, 11), 100, 100);
    const tower = mocks.mockStructure(STRUCTURE_TOWER, { id: 'tower1', pos: pos(12, 12), energy: 0, capacity: 1000 });
    const snap = { energyStructures: [ext, fullExt, tower] };
    const tasks = taskSupply.tasks({ name: 'W1N1' }, snap);
    const ids = tasks.map(function (t) { return t.target.id; });
    assert.deepEqual(ids, ['ext1']);
});

test('tasks returns empty when no energy structures exist', function () {
    mocks.resetGame();
    assert.equal(taskSupply.tasks({ name: 'W1N1' }, {}).length, 0);
    assert.equal(taskSupply.tasks({ name: 'W1N1' }, { energyStructures: [] }).length, 0);
});

test('priorityFor returns UPGRADE when there are no energy structures', function () {
    mocks.resetGame();
    assert.equal(taskSupply.priorityFor({}), taskBase.PRIORITY.UPGRADE);
    assert.equal(taskSupply.priorityFor({ energyStructures: [] }), taskBase.PRIORITY.UPGRADE);
});

test('priorityFor returns 15 when energy ratio is below the critical threshold', function () {
    mocks.resetGame();
    // capacity 100 each, total 200; energy 50 -> ratio 0.25 < 0.3
    const s1 = makeEnergyStructure('s1', pos(10, 10), 25, 100);
    const s2 = makeEnergyStructure('s2', pos(11, 11), 25, 100);
    assert.equal(taskSupply.priorityFor({ energyStructures: [s1, s2] }), 15);
});

test('priorityFor returns SUPPLY when ratio is below the low threshold', function () {
    mocks.resetGame();
    // ratio 0.5 < 0.6, >= 0.3
    const s1 = makeEnergyStructure('s1', pos(10, 10), 50, 100);
    const s2 = makeEnergyStructure('s2', pos(11, 11), 50, 100);
    assert.equal(taskSupply.priorityFor({ energyStructures: [s1, s2] }), taskBase.PRIORITY.SUPPLY);
});

test('priorityFor returns UPGRADE when ratio is healthy', function () {
    mocks.resetGame();
    const s1 = makeEnergyStructure('s1', pos(10, 10), 90, 100);
    const s2 = makeEnergyStructure('s2', pos(11, 11), 90, 100);
    assert.equal(taskSupply.priorityFor({ energyStructures: [s1, s2] }), taskBase.PRIORITY.UPGRADE);
});

test('priorityFor ignores towers when computing the energy ratio', function () {
    mocks.resetGame();
    // Only extensions count: 0/200 = 0 < 0.3 -> 15, even though tower is full.
    const ext1 = makeEnergyStructure('s1', pos(10, 10), 0, 100);
    const ext2 = makeEnergyStructure('s2', pos(11, 11), 0, 100);
    const tower = mocks.mockStructure(STRUCTURE_TOWER, { id: 't1', pos: pos(12, 12), energy: 1000, capacity: 1000 });
    assert.equal(taskSupply.priorityFor({ energyStructures: [ext1, ext2, tower] }), 15);
});

test('run returns false when the target is missing or has no store', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ parts: { carry: 1 } });
    assert.equal(taskSupply.run(creep, { target: null }, {}), false);
    assert.equal(taskSupply.run(creep, { target: { id: 'missing' } }, {}), false);
});

test('run returns false when the target is already full', function () {
    mocks.resetGame();
    const s = makeEnergyStructure('s1', pos(26, 25), 100, 100);
    const creep = mocks.mockCreep({ parts: { carry: 1 }, store: { [RESOURCE_ENERGY]: 50 } });
    assert.equal(taskSupply.run(creep, { target: s }, {}), false);
});

test('run refuels when the creep is empty and a source is available', function () {
    mocks.resetGame();
    const s = makeEnergyStructure('s1', pos(26, 25), 0, 100);
    const storage = mocks.mockStructure(STRUCTURE_STORAGE, {
        id: 'stor1', pos: pos(25, 26), energy: 5000, capacity: 10000,
    });
    const creep = mocks.mockCreep({
        name: 'Sup1', pos: pos(25, 25), parts: { carry: 1 },
        store: {}, capacity: 100,
    });
    let withdrew = false;
    creep.withdraw = function () { withdrew = true; return OK; };
    const snap = { storage: storage, droppedEnergy: [], containers: [], links: [], sources: [] };
    const result = taskSupply.run(creep, { target: s }, snap);
    assert.equal(result, true);
    assert.equal(withdrew, true);
});

test('run returns false when the creep is empty and no source is available', function () {
    mocks.resetGame();
    const s = makeEnergyStructure('s1', pos(26, 25), 0, 100);
    const creep = mocks.mockCreep({
        name: 'Sup1', pos: pos(25, 25), parts: { carry: 1 },
        store: {}, capacity: 100,
    });
    const snap = { storage: null, droppedEnergy: [], containers: [], links: [], sources: [] };
    assert.equal(taskSupply.run(creep, { target: s }, snap), false);
});

test('run transfers energy and keeps the task while still carrying', function () {
    mocks.resetGame();
    const s = makeEnergyStructure('s1', pos(26, 25), 0, 100);
    const creep = mocks.mockCreep({
        name: 'Sup1', pos: pos(25, 25), parts: { carry: 1 },
        store: { [RESOURCE_ENERGY]: 50 }, capacity: 100,
    });
    creep.transfer = function () { return OK; };
    const result = taskSupply.run(creep, { target: s }, {});
    assert.equal(result, true);
});

test('run releases the task once the creep has delivered all its energy', function () {
    mocks.resetGame();
    const s = makeEnergyStructure('s1', pos(26, 25), 0, 100);
    const creep = mocks.mockCreep({
        name: 'Sup1', pos: pos(25, 25), parts: { carry: 1 },
        store: { [RESOURCE_ENERGY]: 50 }, capacity: 100,
    });
    // Simulate a real transfer draining the creep's store.
    creep.transfer = function (target, rtype) { creep.store[rtype] = 0; return OK; };
    const result = taskSupply.run(creep, { target: s }, {});
    assert.equal(result, false);
});