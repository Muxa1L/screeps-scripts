'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../mocks/screeps');
const creepManager = require('../../src/managers/creepManager');
const creepRunner = require('../../src/managers/creepRunner');

test('runCreep wraps getActiveBodyparts with a per-tick per-part cache', function () {
    mocks.resetGame();
    let underlyingCalls = 0;
    const creep = mocks.mockCreep({
        name: 'Miner1-Spawn1',
        pos: { x: 25, y: 25, roomName: 'W1N1' },
        parts: { work: 2, move: 2, carry: 1 },
    });
    // Replace the mock's getActiveBodyparts with a counting version.
    const realParts = { work: 2, move: 2, carry: 1 };
    creep.getActiveBodyparts = function (part) {
        underlyingCalls += 1;
        return realParts[part] || 0;
    };
    // Stub creepRunner.runCreep so creepManager.runCreep only exercises the
    // bodyparts shim and not the full task pipeline.
    const origRunCreep = creepRunner.runCreep;
    let observedFirst, observedSecond;
    creepRunner.runCreep = function (c) {
        // First call inside the pipeline:
        observedFirst = c.getActiveBodyparts(WORK);
        // Second call for the same part — should hit the cache:
        observedSecond = c.getActiveBodyparts(WORK);
    };
    try {
        creepManager.runCreep(creep);
        assert.equal(observedFirst, 2);
        assert.equal(observedSecond, 2);
        // The underlying method runs once for WORK; the second call hits the cache.
        assert.equal(underlyingCalls, 1);
    } finally {
        creepRunner.runCreep = origRunCreep;
    }
});

test('runCreep bodyparts cache resets across ticks', function () {
    mocks.resetGame();
    Game.time = 500;
    let underlyingCalls = 0;
    const creep = mocks.mockCreep({
        name: 'Miner1-Spawn1',
        pos: { x: 25, y: 25, roomName: 'W1N1' },
        parts: { work: 2, move: 2 },
    });
    const realParts = { work: 2, move: 2 };
    creep.getActiveBodyparts = function (part) {
        underlyingCalls += 1;
        return realParts[part] || 0;
    };
    const origRunCreep = creepRunner.runCreep;
    creepRunner.runCreep = function (c) { c.getActiveBodyparts(WORK); };
    try {
        creepManager.runCreep(creep); // tick 500: 1 underlying call
        assert.equal(underlyingCalls, 1);
        Game.time = 501;
        creepManager.runCreep(creep); // tick 501: cache reset, 1 more call
        assert.equal(underlyingCalls, 2);
    } finally {
        creepRunner.runCreep = origRunCreep;
    }
});