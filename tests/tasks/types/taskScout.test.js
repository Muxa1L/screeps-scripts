'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../../mocks/screeps');
const memory = require('../../../src/utils/memorySchema');
const taskScout = require('../../../src/tasks/types/taskScout');

function pos(x, y, roomName) {
    return { x: x, y: y, roomName: roomName || 'W1N1' };
}

test('tasks returns pending remote rooms that pass canActivate', function () {
    mocks.resetGame();
    Game.map.getRoomLinearDistance = function () { return 1; };
    const home = {
        name: 'E1N1',
        controller: { my: true, level: 4 },
        find: function () { return []; },
        storage: null,
    };
    Game.rooms['E1N1'] = home;
    Memory.remoteRooms = {
        'E2N1': { status: 'pending' },
        'E2N2': { status: 'scouted' },
    };
    const tasks = taskScout.tasks(null, null);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].target.id, 'E2N1');
});

test('run marks room scouted and registers sources on arrival', function () {
    mocks.resetGame();
    Memory.remoteRooms = { 'E2N1': { status: 'pending', sourceIds: [] } };
    const source = mocks.mockSource({ id: 'src1', pos: pos(25, 25, 'E2N1') });
    const room = {
        name: 'E2N1',
        find: function (type) { return type === FIND_SOURCES ? [source] : []; },
        controller: null,
    };
    Game.rooms['E2N1'] = room;

    const scout = mocks.mockCreep({ name: 'Scout1', pos: pos(25, 25, 'E2N1'), parts: { move: 1 } });
    memory.setRole(scout, 'scout');
    scout.recycle = function () { return OK; };

    taskScout.run(scout, { target: { id: 'E2N1', pos: pos(25, 25, 'E2N1') } }, null);
    assert.equal(Memory.remoteRooms['E2N1'].status, 'scouted');
    assert.ok(Memory.remoteRooms['E2N1'].sourceIds.indexOf('src1') !== -1);
});
