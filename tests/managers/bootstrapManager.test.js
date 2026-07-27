'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../mocks/screeps');
const memory = require('../../src/utils/memorySchema');
const bootstrapManager = require('../../src/managers/bootstrapManager');

test('tick is a no-op when expansion flag is off', function () {
    mocks.resetGame();
    Memory.flags = { expansion: false };
    Memory.rooms = { 'E2N1': { bootstrapping: true } };
    bootstrapManager.tick();
    assert.equal(Memory.rooms['E2N1'].bootstrapping, true);
});

test('tick clears bootstrapping when spawn exists and RCL >= 2', function () {
    mocks.resetGame();
    Memory.flags = { expansion: true };
    const spawn = mocks.mockStructure('spawn', { id: 'spawn1', pos: { x: 25, y: 25, roomName: 'E2N1' } });
    spawn.structureType = STRUCTURE_SPAWN;
    const room = {
        name: 'E2N1',
        controller: { my: true, level: 2 },
        find: function (type) {
            if (type === FIND_MY_SPAWNS) return [spawn];
            return [];
        },
    };
    Game.rooms['E2N1'] = room;
    Memory.rooms = { 'E2N1': { bootstrapping: true, claimedTick: 100 } };
    bootstrapManager.tick();
    assert.equal(Memory.rooms['E2N1'].bootstrapping, false);
});

test('tick clears bootstrapping on enemy-claimed controller', function () {
    mocks.resetGame();
    Memory.flags = { expansion: true };
    const room = {
        name: 'E2N1',
        controller: { my: false, owner: { username: 'enemy' } },
        find: function () { return []; },
    };
    Game.rooms['E2N1'] = room;
    Memory.rooms = { 'E2N1': { bootstrapping: true } };
    Memory.expansion = { target: { roomName: 'E2N1' }, history: [] };
    bootstrapManager.tick();
    assert.equal(Memory.rooms['E2N1'].bootstrapping, false);
    assert.equal(Memory.expansion.target, undefined);
});