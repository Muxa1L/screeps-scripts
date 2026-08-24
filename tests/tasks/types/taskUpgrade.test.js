'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../../mocks/screeps');
const taskUpgrade = require('../../../src/tasks/types/taskUpgrade');
const taskBase = require('../../../src/tasks/taskBase');

function pos(x, y) {
    return { x: x, y: y, roomName: 'W1N1' };
}

function makeController(id, p, ttd) {
    const obj = {
        id: id,
        pos: p,
        my: true,
        ticksToDowngrade: ttd,
    };
    Game._registerObject(obj);
    return obj;
}

test('canDo requires WORK and CARRY parts', function () {
    mocks.resetGame();
    const ok = mocks.mockCreep({ parts: { work: 1, carry: 1 } });
    const noWork = mocks.mockCreep({ parts: { carry: 1 } });
    const noCarry = mocks.mockCreep({ parts: { work: 1 } });
    assert.equal(taskUpgrade.canDo(ok), true);
    assert.equal(taskUpgrade.canDo(noWork), false);
    assert.equal(taskUpgrade.canDo(noCarry), false);
});

test('tasks returns the controller when owned, empty otherwise', function () {
    mocks.resetGame();
    const ctrl = makeController('c1', pos(25, 25), 5000);
    const room = { name: 'W1N1', controller: ctrl };
    room.controller.my = true;
    const tasks = taskUpgrade.tasks(room, {});
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].target.id, 'c1');

    const neutralRoom = { name: 'W1N1', controller: { my: false } };
    assert.equal(taskUpgrade.tasks(neutralRoom, {}).length, 0);
});

test('capFor scales with controller downgrade urgency', function () {
    mocks.resetGame();
    assert.equal(taskUpgrade.capFor({ name: 'W1N1' }, { controller: { ticksToDowngrade: 400 } }), 12);
    assert.equal(taskUpgrade.capFor({ name: 'W1N1' }, { controller: { ticksToDowngrade: 1000 } }), 8);
    assert.equal(taskUpgrade.capFor({ name: 'W1N1' }, { controller: { ticksToDowngrade: 2000 } }), 6);
    assert.equal(taskUpgrade.capFor({ name: 'W1N1' }, { controller: { ticksToDowngrade: 5000 } }), 4);
    assert.equal(taskUpgrade.capFor({ name: 'W1N1' }, {}), 4);
    assert.equal(taskUpgrade.capFor({ name: 'W1N1' }, { controller: { ticksToDowngrade: 'x' } }), 4);
});

test('priorityFor escalates priority as downgrade approaches', function () {
    mocks.resetGame();
    assert.equal(taskUpgrade.priorityFor({ controller: { ticksToDowngrade: 400 } }), taskBase.PRIORITY.DEFEND);
    assert.equal(taskUpgrade.priorityFor({ controller: { ticksToDowngrade: 1000 } }), taskBase.PRIORITY.RENEW);
    assert.equal(taskUpgrade.priorityFor({ controller: { ticksToDowngrade: 2000 } }), taskBase.PRIORITY.SUPPLY);
    assert.equal(taskUpgrade.priorityFor({ controller: { ticksToDowngrade: 5000 } }), taskBase.PRIORITY.UPGRADE);
    assert.equal(taskUpgrade.priorityFor({}), taskBase.PRIORITY.UPGRADE);
    assert.equal(taskUpgrade.priorityFor({ controller: { ticksToDowngrade: null } }), taskBase.PRIORITY.UPGRADE);
});

test('run returns false when the controller is missing or not owned', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ parts: { work: 1, carry: 1 } });
    assert.equal(taskUpgrade.run(creep, { target: null }, {}), false);
    assert.equal(taskUpgrade.run(creep, { target: { id: 'missing' } }, {}), false);
    // live controller exists but not mine
    const ctrl = makeController('c1', pos(25, 25), 5000);
    ctrl.my = false;
    assert.equal(taskUpgrade.run(creep, { target: ctrl }, {}), false);
});

test('run upgrades when in range with enough energy and returns true', function () {
    mocks.resetGame();
    const ctrl = makeController('c1', pos(26, 25), 5000);
    const creep = mocks.mockCreep({
        name: 'U1', pos: pos(25, 25), parts: { work: 1, carry: 1 },
        store: { [RESOURCE_ENERGY]: 50 }, capacity: 50,
    });
    let upgraded = false;
    creep.upgradeController = function (t) { upgraded = true; return OK; };
    const result = taskUpgrade.run(creep, { target: ctrl }, { controller: ctrl });
    assert.equal(result, true);
    assert.equal(upgraded, true);
});

test('run moves toward the controller when not in range', function () {
    mocks.resetGame();
    const ctrl = makeController('c1', pos(40, 40), 5000);
    const creep = mocks.mockCreep({
        name: 'U1', pos: pos(25, 25), parts: { work: 1, carry: 1 },
        store: { [RESOURCE_ENERGY]: 50 }, capacity: 50,
    });
    let moved = false;
    creep.upgradeController = function () { return ERR_NOT_IN_RANGE; };
    creep.moveTo = function () { moved = true; return OK; };
    const result = taskUpgrade.run(creep, { target: ctrl }, { controller: ctrl });
    assert.equal(result, true);
    assert.equal(moved, true);
});

test('run refuels when energy is below the per-tick upgrade cost', function () {
    mocks.resetGame();
    const ctrl = makeController('c1', pos(26, 25), 5000);
    const source = mocks.mockSource({ id: 'src1', pos: pos(25, 26) });
    // minEnergy = perTickCost = workParts * UPGRADE_CONTROLLER_POWER = 1*1 = 1.
    // energy must be BELOW that (0) to trigger refueling; with 10 energy the
    // creep upgrades instead of walking to a source.
    const creep = mocks.mockCreep({
        name: 'U1', pos: pos(25, 25), parts: { work: 1, carry: 1 },
        store: { [RESOURCE_ENERGY]: 0 }, capacity: 50,
    });
    let harvested = false;
    creep.harvest = function () { harvested = true; return OK; };
    const snap = { controller: ctrl, sources: [source] };
    const result = taskUpgrade.run(creep, { target: ctrl }, snap);
    assert.equal(result, true);
    assert.equal(harvested, true);
});

test('run releases the task when below minEnergy and no source is available', function () {
    mocks.resetGame();
    const ctrl = makeController('c1', pos(26, 25), 5000);
    const creep = mocks.mockCreep({
        name: 'U1', pos: pos(25, 25), parts: { work: 1, carry: 1 },
        store: { [RESOURCE_ENERGY]: 0 }, capacity: 50,
    });
    const snap = { controller: ctrl, sources: [] };
    assert.equal(taskUpgrade.run(creep, { target: ctrl }, snap), false);
});