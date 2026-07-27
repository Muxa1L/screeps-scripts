'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../../mocks/screeps');
const memory = require('../../../src/utils/memorySchema');
const taskBootstrap = require('../../../src/tasks/types/taskBootstrap');

function pos(x, y, roomName) {
    return { x: x, y: y, roomName: roomName || 'W1N1' };
}

test('tasks returns bootstrapping rooms', function () {
    mocks.resetGame();
    Memory.rooms = { 'E2N1': { bootstrapping: true }, 'E3N1': { bootstrapping: false } };
    const tasks = taskBootstrap.tasks(null, null);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].target.id, 'E2N1');
});

test('run moves toward the target room when not there yet', function () {
    mocks.resetGame();
    const bs = mocks.mockCreep({ name: 'BS1', pos: pos(25, 25, 'E1N1'), parts: { work: 1, carry: 1 } });
    memory.setRole(bs, 'bootstrapper');
    const result = taskBootstrap.run(bs, { target: { id: 'E2N1', pos: pos(25, 25, 'E2N1') } }, null);
    assert.equal(result, true);
});

test('run transitions to harvester when spawn exists and RCL >= 2', function () {
    mocks.resetGame();
    const spawn = mocks.mockStructure('spawn', { id: 'spawn1', pos: pos(25, 25, 'E2N1') });
    spawn.structureType = STRUCTURE_SPAWN;
    const room = {
        name: 'E2N1',
        controller: { my: true, level: 2, pos: pos(25, 25, 'E2N1') },
        find: function (type) {
            if (type === FIND_MY_SPAWNS) return [spawn];
            return [];
        },
    };
    Game.rooms['E2N1'] = room;
    const bs = mocks.mockCreep({ name: 'BS1', pos: pos(25, 25, 'E2N1'), parts: { work: 1, carry: 1 } });
    memory.setRole(bs, 'bootstrapper');
    memory.setBootstrapRoom(bs, 'E2N1');
    Memory.rooms = { 'E2N1': { bootstrapping: true } };
    Memory.expansion = { target: { roomName: 'E2N1' }, history: [] };
    const result = taskBootstrap.run(bs, { target: { id: 'E2N1', pos: pos(25, 25, 'E2N1') } }, null);
    assert.equal(result, false);
    assert.equal(memory.getRole(bs), 'harvester');
    assert.equal(Memory.rooms['E2N1'].bootstrapping, false);
    assert.equal(Memory.expansion.target, undefined);
});