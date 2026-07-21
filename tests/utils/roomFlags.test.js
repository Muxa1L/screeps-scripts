'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../mocks/screeps');
const roomFlags = require('../../src/utils/roomFlags');

test('getPriorityContainers ignores non-haul flags and returns containers at haul flags', function () {
    mocks.resetGame();
    const container = mocks.mockStructure(STRUCTURE_CONTAINER, { id: 'priority', pos: { x: 30, y: 30, roomName: 'W1N1' } });
    Game.flags['haul:cache'] = mocks.mockFlag('haul:cache', container.pos, [container]);
    Game.flags['ignore-me'] = mocks.mockFlag('ignore-me', container.pos, [container]);
    const found = roomFlags.getPriorityContainers('W1N1');
    assert.equal(found.length, 1);
    assert.equal(found[0].id, 'priority');
});

test('getPriorityContainers filters by room name', function () {
    mocks.resetGame();
    const local = mocks.mockStructure(STRUCTURE_CONTAINER, { id: 'local', pos: { x: 30, y: 30, roomName: 'W1N1' } });
    const remote = mocks.mockStructure(STRUCTURE_CONTAINER, { id: 'remote', pos: { x: 30, y: 30, roomName: 'W2N2' } });
    Game.flags['haul:local'] = mocks.mockFlag('haul:local', local.pos, [local]);
    Game.flags['haul:remote'] = mocks.mockFlag('haul:remote', remote.pos, [remote]);
    const found = roomFlags.getPriorityContainers('W1N1');
    assert.equal(found.length, 1);
    assert.equal(found[0].id, 'local');
});
