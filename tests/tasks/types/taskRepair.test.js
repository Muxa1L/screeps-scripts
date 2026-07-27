'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../../mocks/screeps');
const taskRepair = require('../../../src/tasks/types/taskRepair');

function pos(x, y) {
    return { x: x, y: y, roomName: 'W1N1' };
}

function makeStructure(id, p, hits, hitsMax) {
    const obj = mocks.mockStructure(STRUCTURE_ROAD, {
        id: id, pos: p, hits: hits, hitsMax: hitsMax || 1000,
    });
    return obj;
}

test('canDo requires WORK and CARRY parts', function () {
    mocks.resetGame();
    const ok = mocks.mockCreep({ parts: { work: 1, carry: 1 } });
    const noWork = mocks.mockCreep({ parts: { carry: 1 } });
    const noCarry = mocks.mockCreep({ parts: { work: 1 } });
    assert.equal(taskRepair.canDo(ok), true);
    assert.equal(taskRepair.canDo(noWork), false);
    assert.equal(taskRepair.canDo(noCarry), false);
});

test('tasks emits critical targets before non-critical ones', function () {
    mocks.resetGame();
    const crit = makeStructure('crit', pos(10, 10), 100);
    const nonCrit = makeStructure('nonCrit', pos(20, 20), 800);
    const tasks = taskRepair.tasks({ name: 'W1N1' }, {
        damagedCritical: [crit],
        damagedNonCritical: [nonCrit],
    });
    assert.equal(tasks.length, 2);
    assert.equal(tasks[0].target.id, 'crit');
    assert.equal(tasks[1].target.id, 'nonCrit');
});

test('tasks returns empty when no damaged structures exist', function () {
    mocks.resetGame();
    const tasks = taskRepair.tasks({ name: 'W1N1' }, {
        damagedCritical: [],
        damagedNonCritical: [],
    });
    assert.equal(tasks.length, 0);
});

test('run returns false when the target is missing', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ parts: { work: 1, carry: 1 } });
    assert.equal(taskRepair.run(creep, { target: null }, {}), false);
});

test('run returns false when the live structure is gone', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ parts: { work: 1, carry: 1 } });
    assert.equal(taskRepair.run(creep, { target: { id: 'missing' } }, {}), false);
});

test('run returns false when the structure is already at full hits', function () {
    mocks.resetGame();
    const s = makeStructure('s1', pos(26, 25), 1000, 1000);
    const creep = mocks.mockCreep({ parts: { work: 1, carry: 1 } });
    assert.equal(taskRepair.run(creep, { target: s }, {}), false);
});

test('run repairs when in range and returns true', function () {
    mocks.resetGame();
    const s = makeStructure('s1', pos(26, 25), 100, 1000);
    const creep = mocks.mockCreep({
        name: 'R1', pos: pos(25, 25), parts: { work: 1, carry: 1 },
        store: { [RESOURCE_ENERGY]: 50 }, capacity: 50,
    });
    let repaired = false;
    creep.repair = function (t) { repaired = true; return OK; };
    const result = taskRepair.run(creep, { target: s }, {});
    assert.equal(result, true);
    assert.equal(repaired, true);
});

test('run releases the task when this repair completes the structure', function () {
    mocks.resetGame();
    // hitsMax - hits = 50 <= workParts(1) * REPAIR_POWER(100)
    const s = makeStructure('s1', pos(26, 25), 950, 1000);
    const creep = mocks.mockCreep({
        name: 'R1', pos: pos(25, 25), parts: { work: 1, carry: 1 },
        store: { [RESOURCE_ENERGY]: 50 }, capacity: 50,
    });
    creep.repair = function () { return OK; };
    assert.equal(taskRepair.run(creep, { target: s }, {}), false);
});

test('run moves toward the structure when not in range', function () {
    mocks.resetGame();
    const s = makeStructure('s1', pos(40, 40), 100, 1000);
    const creep = mocks.mockCreep({
        name: 'R1', pos: pos(25, 25), parts: { work: 1, carry: 1 },
        store: { [RESOURCE_ENERGY]: 50 }, capacity: 50,
    });
    let moved = false;
    creep.repair = function () { return ERR_NOT_IN_RANGE; };
    creep.moveTo = function () { moved = true; return OK; };
    const result = taskRepair.run(creep, { target: s }, {});
    assert.equal(result, true);
    assert.equal(moved, true);
});

test('run refuels from a source when energy is below minEnergy', function () {
    mocks.resetGame();
    const s = makeStructure('s1', pos(26, 25), 100, 1000);
    const source = mocks.mockSource({ id: 'src1', pos: pos(25, 26) });
    const creep = mocks.mockCreep({
        name: 'R1', pos: pos(25, 25), parts: { work: 1, carry: 1 },
        store: {}, capacity: 50,
    });
    let harvested = false;
    creep.harvest = function () { harvested = true; return OK; };
    const snap = { sources: [source] };
    const result = taskRepair.run(creep, { target: s }, snap);
    assert.equal(result, true);
    assert.equal(harvested, true);
});

test('run releases the task when empty and no energy source is available', function () {
    mocks.resetGame();
    const s = makeStructure('s1', pos(26, 25), 100, 1000);
    const creep = mocks.mockCreep({
        name: 'R1', pos: pos(25, 25), parts: { work: 1, carry: 1 },
        store: {}, capacity: 50,
    });
    const snap = { sources: [] };
    assert.equal(taskRepair.run(creep, { target: s }, snap), false);
});