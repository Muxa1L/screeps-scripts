'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../mocks/screeps');
const memory = require('../../src/utils/memorySchema');

function makeCreep(mem) {
    return { name: 'c', memory: mem || {} };
}

test('role accessors read and write safely', function () {
    mocks.resetMemory();
    const creep = makeCreep();
    assert.equal(memory.getRole(creep), null);
    memory.setRole(creep, 'hauler');
    assert.equal(memory.getRole(creep), 'hauler');
});

test('taskId accessors read and write safely', function () {
    mocks.resetMemory();
    const creep = makeCreep();
    assert.equal(memory.getTaskId(creep), null);
    memory.setTaskId(creep, 'task-1');
    assert.equal(memory.getTaskId(creep), 'task-1');
    memory.clearTaskId(creep);
    assert.equal(memory.getTaskId(creep), null);
});

test('failedTasks records TTL and cleans up expired entries', function () {
    mocks.resetMemory();
    mocks.resetGame();
    Game.time = 100;
    const creep = makeCreep();
    memory.addFailedTask(creep, 'a', 10);
    memory.addFailedTask(creep, 'b', 20);
    assert.deepEqual(memory.getFailedTasks(creep), { a: 110, b: 120 });
    Game.time = 111;
    memory.cleanupFailedTasks(creep);
    assert.deepEqual(memory.getFailedTasks(creep), { b: 120 });
    Game.time = 121;
    memory.cleanupFailedTasks(creep);
    assert.deepEqual(memory.getFailedTasks(creep), {});
});

test('move and action accessors read and write safely', function () {
    mocks.resetMemory();
    const creep = makeCreep();
    assert.equal(memory.getMoveFailures(creep), 0);
    memory.setMoveFailures(creep, 3);
    assert.equal(memory.getMoveFailures(creep), 3);
    assert.equal(memory.getMoveTargetId(creep), null);
    memory.setMoveTargetId(creep, 'target-1');
    assert.equal(memory.getMoveTargetId(creep), 'target-1');
    assert.equal(memory.getAction(creep), '');
    memory.setAction(creep, 'moving');
    assert.equal(memory.getAction(creep), 'moving');
});

test('room and source memory initialize missing parents', function () {
    mocks.resetMemory();
    const roomMem = memory.getRoomMemory('W1N1');
    assert.ok(roomMem);
    assert.equal(Memory.rooms.W1N1, roomMem);
    const sourceMem = memory.getSourceMemory('source-1');
    assert.ok(sourceMem);
    assert.equal(Memory.sources['source-1'], sourceMem);
    assert.deepEqual(sourceMem, { roomName: '', x: 0, y: 0, slots: [] });
});
