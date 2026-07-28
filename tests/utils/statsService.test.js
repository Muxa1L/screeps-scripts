'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mock = require('../mocks/screeps');
const statsService = require('../../src/utils/statsService');

beforeEach(function () {
    mock.resetGame();
    mock.resetMemory();
});

test('records per-module CPU', function () {
    statsService.tickStart();
    statsService.recordModule('roomManager', 12);
    statsService.recordModule('creepManager', 8);
    const snap = statsService.snapshot();
    assert.equal(snap.modules.roomManager, 12);
    assert.equal(snap.modules.creepManager, 8);
    assert.equal(snap.total, 20);
});

test('tickStart is a no-op when called twice on the same tick', function () {
    statsService.tickStart();
    statsService.recordModule('test', 5);
    statsService.tickStart(); // should not reset
    const snap = statsService.snapshot();
    assert.equal(snap.modules.test, 5);
});

test('tickStart resets perModule on a new tick', function () {
    statsService.tickStart();
    statsService.recordModule('test', 5);
    Game.time = Game.time + 1;
    statsService.tickStart();
    const snap = statsService.snapshot();
    assert.equal(snap.total, 0);
});

test('aggregate pushes into Memory.stats.cpuByModule', function () {
    statsService.tickStart();
    statsService.recordModule('roomManager', 10);
    statsService.recordModule('creepManager', 6);
    statsService.aggregate();
    assert.ok(Memory.stats.cpuByModule);
    assert.ok(Memory.stats.cpuByModule.roomManager);
    assert.equal(Memory.stats.cpuByModule.roomManager.length, 1);
    assert.equal(Memory.stats.cpuByModule.roomManager[0].ms, 10);
    assert.equal(Memory.stats.cpuByModule.creepManager[0].ms, 6);
});

test('aggregate resets perModule for the next window', function () {
    statsService.tickStart();
    statsService.recordModule('test', 10);
    statsService.aggregate();
    const snap = statsService.snapshot();
    assert.equal(snap.total, 0);
});

test('caps cpuByModule at STATS_MAX_SAMPLES', function () {
    const max = statsService.STATS_MAX_SAMPLES;
    for (let t = 0; t < max + 10; t++) {
        Game.time = t;
        statsService.tickStart();
        statsService.recordModule('test', 1);
        statsService.aggregate();
    }
    assert.ok(Memory.stats.cpuByModule.test.length <= max);
});

test('logTable is a no-op when tick is not a multiple of 100', function () {
    Game.time = 50;
    statsService.tickStart();
    statsService.recordModule('test', 5);
    // Should not throw and should not log
    statsService.logTable();
    // No assertion needed — if it doesn't throw, it passed
});

test('logTable outputs when tick is a multiple of 100', function () {
    Game.time = 100;
    statsService.tickStart();
    statsService.recordModule('roomManager', 15);
    statsService.recordModule('creepManager', 5);
    // Capture console.log
    const originalLog = console.log;
    let captured = '';
    console.log = function (msg) { captured = msg; };
    try {
        statsService.logTable();
    } finally {
        console.log = originalLog;
    }
    assert.ok(captured.indexOf('[stats]') !== -1);
    assert.ok(captured.indexOf('roomManager') !== -1);
    assert.ok(captured.indexOf('75.0%') !== -1); // 15/20 = 75%
});

test('recordProgression tracks RCL progress delta', function () {
    Game.time = 100;
    Game.rooms['W1N1'] = {
        controller: { my: true, level: 3, progress: 5000, progressTotal: 10000 },
        name: 'W1N1',
    };
    // First call records baseline
    statsService.recordProgression();
    assert.ok(Memory.stats.rclHistory['W1N1']);
    assert.equal(Memory.stats.rclHistory['W1N1'].progress, 5000);

    // Second call computes delta
    Game.time = 200;
    Game.rooms['W1N1'].controller.progress = 8000;
    const originalLog = console.log;
    let captured = '';
    console.log = function (msg) { captured = msg; };
    try {
        statsService.recordProgression();
    } finally {
        console.log = originalLog;
    }
    assert.ok(captured.indexOf('W1N1') !== -1);
    assert.ok(captured.indexOf('ep/t') !== -1);
});

test('tick calls logTable and aggregate on 100-tick boundary', function () {
    Game.time = 100;
    statsService.tickStart();
    statsService.recordModule('test', 5);
    // Capture console.log
    const originalLog = console.log;
    let captured = '';
    console.log = function (msg) { captured = msg; };
    try {
        statsService.tick();
    } finally {
        console.log = originalLog;
    }
    assert.ok(captured.indexOf('[stats]') !== -1);
    assert.ok(Memory.stats.cpuByModule);
    assert.ok(Memory.stats.cpuByModule.test);
});