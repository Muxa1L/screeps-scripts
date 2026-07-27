'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../../mocks/screeps');
const memory = require('../../../src/utils/memorySchema');
const taskHarvest = require('../../../src/tasks/types/taskHarvest');
const taskBase = require('../../../src/tasks/taskBase');

function pos(x, y) {
    return { x: x, y: y, roomName: 'W1N1' };
}

function makeHarvester(opts) {
    const c = mocks.mockCreep({
        name: opts.name || 'Harvester1',
        pos: opts.pos || pos(25, 25),
        parts: { work: 1, carry: 1, move: 1 },
    });
    c.id = opts.id || (opts.name || 'Harvester1');
    memory.setRole(c, 'harvester');
    if (opts.taskId !== undefined) memory.setTaskId(c, opts.taskId);
    Game.creeps[c.name] = c;
    return c;
}

function makeSource(id, p) {
    return mocks.mockSource({ id: id, pos: p });
}

test('score equals approxDistance when no other harvesters are assigned', function () {
    mocks.resetGame();
    const creep = makeHarvester({ name: 'H1', pos: pos(10, 10) });
    const src = makeSource('srcA', pos(20, 10));
    const expected = taskBase.approxDistance(creep, src);
    assert.equal(taskHarvest.score(creep, src), expected);
});

test('score penalizes a crowded source so an empty harvester prefers the less-crowded source', function () {
    mocks.resetGame();
    const chooser = makeHarvester({ name: 'chooser', pos: pos(25, 25) });
    // Two harvesters already on srcA, none on srcB.
    makeHarvester({ name: 'hA1', pos: pos(10, 10), taskId: 'harvest:W1N1:srcA' });
    makeHarvester({ name: 'hA2', pos: pos(10, 10), taskId: 'harvest:W1N1:srcA' });
    const srcA = makeSource('srcA', pos(25, 20)); // dist 5 from chooser
    const srcB = makeSource('srcB', pos(25, 20)); // same pos -> same dist
    // Same distance: srcA has 2 claims (+100), srcB has 0. B must win.
    assert.ok(taskHarvest.score(chooser, srcB) < taskHarvest.score(chooser, srcA));
    assert.equal(taskHarvest.score(chooser, srcA), 5 + 2 * 50);
    assert.equal(taskHarvest.score(chooser, srcB), 5);
});

test('score self-excludes the creep\'s own current harvest assignment', function () {
    mocks.resetGame();
    // The chooser is itself on srcA, plus one other harvester on srcA (claims=2).
    // Self-exclusion should reduce the penalty by 1 (so claims=1, penalty=50, not 100).
    const chooser = makeHarvester({ name: 'chooser', pos: pos(10, 10), taskId: 'harvest:W1N1:srcA' });
    makeHarvester({ name: 'hA2', pos: pos(10, 10), taskId: 'harvest:W1N1:srcA' });
    const srcA = makeSource('srcA', pos(20, 10)); // dist 10
    // claims before self-exclusion = 2; after = 1.
    assert.equal(taskHarvest.score(chooser, srcA), 10 + 1 * 50);
});

test('score still rewards distance when claims are equal', function () {
    mocks.resetGame();
    const chooser = makeHarvester({ name: 'chooser', pos: pos(25, 25) });
    // One harvester on each source: equal claims (1 each).
    makeHarvester({ name: 'hA', pos: pos(10, 10), taskId: 'harvest:W1N1:srcA' });
    makeHarvester({ name: 'hB', pos: pos(40, 40), taskId: 'harvest:W1N1:srcB' });
    const srcA = makeSource('srcA', pos(26, 25)); // dist 1
    const srcB = makeSource('srcB', pos(40, 25)); // dist 15
    // Equal claims -> distance decides. srcA closer.
    assert.ok(taskHarvest.score(chooser, srcA) < taskHarvest.score(chooser, srcB));
});

test('harvestCounts ignores non-harvester creeps even if they hold a harvest: taskId', function () {
    mocks.resetGame();
    // An upgrader mistakenly holding a harvest taskId should not count.
    const chooser = makeHarvester({ name: 'chooser', pos: pos(25, 25) });
    const upgrader = mocks.mockCreep({
        name: 'Upgrader1',
        pos: pos(10, 10),
        parts: { work: 1, carry: 1, move: 1 },
    });
    memory.setRole(upgrader, 'upgrader');
    memory.setTaskId(upgrader, 'harvest:W1N1:srcA');
    Game.creeps[upgrader.name] = upgrader;
    const srcA = makeSource('srcA', pos(25, 20)); // dist 5
    // No harvesters on srcA -> no penalty.
    assert.equal(taskHarvest.score(chooser, srcA), 5);
});