'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../mocks/screeps');
const routeCache = require('../../src/utils/routeCache');

test('getRoute caches Game.map.findRoute result', function () {
    mocks.resetGame();
    Memory.remoteRooms = { E2N1: { routes: {} } };
    let calls = 0;
    Game.map.findRoute = function () { calls++; return [{ exit: FIND_EXIT_RIGHT, room: 'E2N1' }]; };

    const r1 = routeCache.getRoute('E1N1', 'E2N1');
    const r2 = routeCache.getRoute('E1N1', 'E2N1');

    assert.equal(calls, 1, 'findRoute should be called once when cached');
    assert.deepEqual(r1, [{ exit: FIND_EXIT_RIGHT, room: 'E2N1' }]);
    assert.deepEqual(r2, r1);
});

test('getRoute recomputes when force is true', function () {
    mocks.resetGame();
    Memory.remoteRooms = { E2N2: { routes: { 'E1N1': { route: [{ exit: FIND_EXIT_RIGHT, room: 'E2N1' }], tick: Game.time } } } };
    let calls = 0;
    Game.map.findRoute = function () { calls++; return [{ exit: FIND_EXIT_BOTTOM, room: 'E1N2' }, { exit: FIND_EXIT_RIGHT, room: 'E2N2' }]; };

    routeCache.getRoute('E1N1', 'E2N2', { force: true });

    assert.equal(calls, 1);
});

test('getNextStep returns the correct next exit', function () {
    mocks.resetGame();
    Memory.remoteRooms = { E2N1: { routes: { 'E1N1': { route: [{ exit: FIND_EXIT_RIGHT, room: 'E2N1' }], tick: Game.time } } } };
    Game.map.findRoute = function () { return [{ exit: FIND_EXIT_RIGHT, room: 'E2N1' }]; };

    const step = routeCache.getNextStep('E1N1', 'E2N1', 'E1N1');
    assert.equal(step.exit, FIND_EXIT_RIGHT);
    assert.equal(step.room, 'E2N1');
});

test('getNextStep returns ROUTE_DONE when already at destination', function () {
    mocks.resetGame();
    Memory.remoteRooms = { E2N1: { routes: { 'E1N1': { route: [{ exit: FIND_EXIT_RIGHT, room: 'E2N1' }], tick: Game.time } } } };
    Game.map.findRoute = function () { return [{ exit: FIND_EXIT_RIGHT, room: 'E2N1' }]; };

    const step = routeCache.getNextStep('E1N1', 'E2N1', 'E2N1');
    assert.equal(step, routeCache.ROUTE_DONE);
});
