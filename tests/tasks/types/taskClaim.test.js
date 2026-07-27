'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../../mocks/screeps');
const memory = require('../../../src/utils/memorySchema');
const taskClaim = require('../../../src/tasks/types/taskClaim');

function pos(x, y, roomName) {
    return { x: x, y: y, roomName: roomName || 'W1N1' };
}

test('tasks returns the expansion target room', function () {
    mocks.resetGame();
    memory.ensureExpansion();
    Memory.expansion.target = { roomName: 'E2N1' };
    const tasks = taskClaim.tasks(null, null);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].target.id, 'E2N1');
});

test('tasks is empty when no expansion target is set', function () {
    mocks.resetGame();
    Memory.expansion = { history: [] };
    const tasks = taskClaim.tasks(null, null);
    assert.equal(tasks.length, 0);
});

test('run moves toward the target room when not there yet', function () {
    mocks.resetGame();
    memory.ensureExpansion();
    Memory.expansion.target = { roomName: 'E2N1' };
    const claimer = mocks.mockCreep({ name: 'Claimer1', pos: pos(25, 25, 'E1N1'), parts: { claim: 1 } });
    memory.setRole(claimer, 'claimer');
    const result = taskClaim.run(claimer, { target: { id: 'E2N1', pos: pos(25, 25, 'E2N1') } }, null);
    assert.equal(result, true);
});

test('run clears target and recycles on enemy-claimed controller', function () {
    mocks.resetGame();
    memory.ensureExpansion();
    Memory.expansion.target = { roomName: 'E2N1' };
    const room = {
        name: 'E2N1',
        controller: { my: false, owner: { username: 'enemy' }, pos: pos(25, 25, 'E2N1') },
    };
    Game.rooms['E2N1'] = room;
    const claimer = mocks.mockCreep({ name: 'Claimer1', pos: pos(25, 25, 'E2N1'), parts: { claim: 1 } });
    memory.setRole(claimer, 'claimer');
    claimer.memory.homeRoom = 'E1N1';
    const spawn = mocks.mockStructure('spawn', { id: 'spawn1', pos: pos(25, 25, 'E1N1') });
    spawn.structureType = STRUCTURE_SPAWN;
    spawn.recycleCreep = function () { return OK; };
    Game.spawns = { 'Spawn1': spawn };
    const result = taskClaim.run(claimer, { target: { id: 'E2N1', pos: pos(25, 25, 'E2N1') } }, null);
    assert.equal(result, false);
    assert.equal(Memory.expansion.target, undefined);
});