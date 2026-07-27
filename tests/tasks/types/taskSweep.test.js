'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../../mocks/screeps');
const taskSweep = require('../../../src/tasks/types/taskSweep');

function pos(x, y) {
    return { x: x, y: y, roomName: 'W1N1' };
}

function makeContainer(id, energy) {
    return mocks.mockStructure(STRUCTURE_CONTAINER, {
        id: id, pos: pos(30, 30),
        energy: energy || 0, capacity: 2000,
    });
}

function makeTombstone(id, store) {
    const t = makeContainer(id, 0);
    t.store = store || { [RESOURCE_ENERGY]: 50 };
    return t;
}

test('tasks filters out tiny dropped-energy piles below DROPPED_ENERGY_MIN', function () {
    mocks.resetGame();
    const bigDrop = mocks.mockDroppedResource(150, pos(10, 10));
    const smallDrop = mocks.mockDroppedResource(50, pos(11, 11));
    const room = { name: 'W1N1' };
    const snap = { droppedEnergy: [bigDrop, smallDrop], tombstones: [], ruins: [] };
    const tasks = taskSweep.tasks(room, snap);
    const ids = tasks.map(function (t) { return t.target.id; });
    assert.ok(ids.indexOf(bigDrop.id) !== -1, 'large drop should be admitted');
    assert.ok(ids.indexOf(smallDrop.id) === -1, 'small drop should be filtered');
});

test('score prefers a large energy pile over a closer small one', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ name: 'Sweeper1', pos: pos(25, 25), parts: { carry: 2, move: 2 } });
    creep.pos.findPathTo = function (target) {
        return new Array(Math.max(Math.abs(this.x - target.pos.x), Math.abs(this.y - target.pos.y)));
    };
    const closeSmall = { id: 'dropA', pos: pos(26, 25), amount: 100 };
    const farLarge = { id: 'dropB', pos: pos(32, 25), amount: 1000 };
    const scoreSmall = taskSweep.score(creep, closeSmall);
    const scoreLarge = taskSweep.score(creep, farLarge);
    // farLarge is 6 tiles farther but gets a +10 amount bonus, so it should win.
    assert.ok(scoreLarge < scoreSmall, 'large pile should score lower (better) than closer small pile');
});

test('score still picks a closer pile when amounts are equal', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ name: 'Sweeper2', pos: pos(25, 25), parts: { carry: 2, move: 2 } });
    creep.pos.findPathTo = function (target) {
        return new Array(Math.max(Math.abs(this.x - target.pos.x), Math.abs(this.y - target.pos.y)));
    };
    const close = { id: 'dropA', pos: pos(26, 25), amount: 100 };
    const far = { id: 'dropB', pos: pos(35, 25), amount: 100 };
    assert.ok(taskSweep.score(creep, close) < taskSweep.score(creep, far));
});
