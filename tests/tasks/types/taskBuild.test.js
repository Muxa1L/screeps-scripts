'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../../mocks/screeps');
const taskBuild = require('../../../src/tasks/types/taskBuild');

function pos(x, y) {
    return { x: x, y: y, roomName: 'W1N1' };
}

function makeSite(id, p, progress, progressTotal) {
    const obj = {
        id: id,
        pos: p,
        progress: progress || 0,
        progressTotal: progressTotal || 1000,
    };
    Game._registerObject(obj);
    return obj;
}

test('canDo requires WORK and CARRY parts', function () {
    mocks.resetGame();
    const ok = mocks.mockCreep({ parts: { work: 1, carry: 1 } });
    const noWork = mocks.mockCreep({ parts: { carry: 1 } });
    const noCarry = mocks.mockCreep({ parts: { work: 1 } });
    assert.equal(taskBuild.canDo(ok), true);
    assert.equal(taskBuild.canDo(noWork), false);
    assert.equal(taskBuild.canDo(noCarry), false);
});

test('tasks maps each construction site in the snapshot', function () {
    mocks.resetGame();
    const s1 = makeSite('s1', pos(10, 10));
    const s2 = makeSite('s2', pos(20, 20));
    const tasks = taskBuild.tasks({ name: 'W1N1' }, { constructionSites: [s1, s2] });
    assert.equal(tasks.length, 2);
    assert.equal(tasks[0].target.id, 's1');
    assert.equal(tasks[1].target.id, 's2');
});

test('score is half the path distance', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ name: 'B1', pos: pos(25, 25), parts: { work: 1, carry: 1 } });
    creep.pos.findPathTo = function (target) {
        return new Array(Math.max(Math.abs(this.x - target.pos.x), Math.abs(this.y - target.pos.y)));
    };
    const near = makeSite('near', pos(26, 25));
    const far = makeSite('far', pos(35, 25));
    // near dist 1 -> score floor(1/2)=0; far dist 10 -> score 5
    assert.equal(taskBuild.score(creep, near), 0);
    assert.equal(taskBuild.score(creep, far), 5);
});

test('score applies a -1000 bonus to a build-flagged priority site', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ name: 'B1', pos: pos(25, 25), parts: { work: 1, carry: 1 } });
    creep.pos.findPathTo = function (target) {
        return new Array(Math.max(Math.abs(this.x - target.pos.x), Math.abs(this.y - target.pos.y)));
    };
    const near = makeSite('near', pos(26, 25));
    const far = makeSite('far', pos(35, 25));
    const flagPos = mocks.makePos(pos(35, 25), { [LOOK_CONSTRUCTION_SITES]: [far] });
    Game.flags['build:far'] = { name: 'build:far', pos: flagPos };
    // far would normally lose (5 vs 0), but the -1000 priority bonus wins.
    assert.ok(taskBuild.score(creep, far) < taskBuild.score(creep, near));
});

test('run returns false when the target is missing or has no id', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ parts: { work: 1, carry: 1 } });
    assert.equal(taskBuild.run(creep, { target: null }, {}), false);
    assert.equal(taskBuild.run(creep, { target: {} }, {}), false);
});

test('run returns false when the live site is gone or already complete', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ parts: { work: 1, carry: 1 } });
    // getObjectById returns null for unregistered id
    assert.equal(taskBuild.run(creep, { target: { id: 'missing' } }, {}), false);
    // complete site
    const done = makeSite('done', pos(26, 25), 1000, 1000);
    assert.equal(taskBuild.run(creep, { target: done }, {}), false);
});

test('run builds when in range and energy is sufficient, returns true', function () {
    mocks.resetGame();
    const site = makeSite('s1', pos(26, 25), 0, 1000);
    const creep = mocks.mockCreep({
        name: 'B1', pos: pos(25, 25), parts: { work: 1, carry: 1 },
        store: { [RESOURCE_ENERGY]: 50 }, capacity: 50,
    });
    let built = false;
    creep.build = function (t) { built = true; return OK; };
    const result = taskBuild.run(creep, { target: site }, {});
    assert.equal(result, true);
    assert.equal(built, true);
});

test('run releases the task when this build action completes the site', function () {
    mocks.resetGame();
    // progressTotal - progress = 4 <= workParts(1) * BUILD_POWER(5)
    const site = makeSite('s1', pos(26, 25), 996, 1000);
    const creep = mocks.mockCreep({
        name: 'B1', pos: pos(25, 25), parts: { work: 1, carry: 1 },
        store: { [RESOURCE_ENERGY]: 50 }, capacity: 50,
    });
    creep.build = function () { return OK; };
    assert.equal(taskBuild.run(creep, { target: site }, {}), false);
});

test('run moves toward the site when not in range', function () {
    mocks.resetGame();
    const site = makeSite('s1', pos(40, 40), 0, 1000);
    const creep = mocks.mockCreep({
        name: 'B1', pos: pos(25, 25), parts: { work: 1, carry: 1 },
        store: { [RESOURCE_ENERGY]: 50 }, capacity: 50,
    });
    let moved = false;
    creep.build = function () { return ERR_NOT_IN_RANGE; };
    creep.moveTo = function () { moved = true; return OK; };
    const result = taskBuild.run(creep, { target: site }, {});
    assert.equal(result, true);
    assert.equal(moved, true);
});

test('run refuels from a source when energy is below minEnergy', function () {
    mocks.resetGame();
    const site = makeSite('s1', pos(26, 25), 0, 1000);
    const source = mocks.mockSource({ id: 'src1', pos: pos(25, 26) });
    const creep = mocks.mockCreep({
        name: 'B1', pos: pos(25, 25), parts: { work: 1, carry: 1 },
        store: {}, capacity: 50,
    });
    let harvested = false;
    creep.harvest = function () { harvested = true; return OK; };
    const snap = { sources: [source] };
    const result = taskBuild.run(creep, { target: site }, snap);
    assert.equal(result, true);
    assert.equal(harvested, true);
});

test('run releases the task when empty and no energy source is available', function () {
    mocks.resetGame();
    const site = makeSite('s1', pos(26, 25), 0, 1000);
    const creep = mocks.mockCreep({
        name: 'B1', pos: pos(25, 25), parts: { work: 1, carry: 1 },
        store: {}, capacity: 50,
    });
    const snap = { sources: [] };
    assert.equal(taskBuild.run(creep, { target: site }, snap), false);
});