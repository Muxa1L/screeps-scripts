'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mock = require('../../mocks/screeps');
const nukeService = require('../../../src/managers/upkeep/nukeService');
const memory = require('../../../src/utils/memorySchema');

beforeEach(function () {
    mock.resetGame();
    mock.resetMemory();
});

function makeOwnedRoom(name) {
    const room = {
        name: name,
        controller: {
            my: true,
            level: 3,
            safeModeAvailable: 1,
            safeMode: undefined,
            safeModeCooldown: undefined,
            activateSafeMode: function () { this.safeMode = 20000; return OK; },
        },
        find: function (type) { return this._findResults[type] || []; },
        _findResults: {},
    };
    Game.rooms[name] = room;
    return room;
}

function makeNuke(timeToLand, x, y, roomName) {
    return {
        timeToLand: timeToLand,
        launchRoomName: 'W1N1',
        pos: { x: x, y: y, roomName: roomName },
    };
}

test('detects nukes in owned rooms and records events', function () {
    const room = makeOwnedRoom('W1N1');
    room._findResults[FIND_NUKES] = [makeNuke(40000, 25, 25, 'W1N1')];
    nukeService.tick();
    const events = memory.getNukeEvents();
    assert.ok(events['W1N1']);
    assert.equal(events['W1N1'].timeToLand, 40000);
    assert.equal(events['W1N1'].pos.x, 25);
    assert.ok(memory.ensureNuke().stat.nukesDetected > 0);
});

test('triggers safe mode when timeToLand is below threshold', function () {
    const room = makeOwnedRoom('W1N1');
    room._findResults[FIND_NUKES] = [makeNuke(3000, 25, 25, 'W1N1')];
    const originalLog = console.log;
    console.log = function () {};
    try {
        nukeService.tick();
    } finally {
        console.log = originalLog;
    }
    assert.equal(room.controller.safeMode, 20000);
    assert.ok(memory.ensureNuke().stat.safeModeTriggered > 0);
});

test('does not trigger safe mode when timeToLand is above threshold', function () {
    const room = makeOwnedRoom('W1N1');
    room._findResults[FIND_NUKES] = [makeNuke(10000, 25, 25, 'W1N1')];
    nukeService.tick();
    assert.equal(room.controller.safeMode, undefined);
});

test('does not trigger safe mode when safeModeAvailable is 0', function () {
    const room = makeOwnedRoom('W1N1');
    room.controller.safeModeAvailable = 0;
    room._findResults[FIND_NUKES] = [makeNuke(3000, 25, 25, 'W1N1')];
    nukeService.tick();
    assert.equal(room.controller.safeMode, undefined);
});

test('does not trigger safe mode when on cooldown', function () {
    const room = makeOwnedRoom('W1N1');
    room.controller.safeModeCooldown = 5000;
    room._findResults[FIND_NUKES] = [makeNuke(3000, 25, 25, 'W1N1')];
    nukeService.tick();
    assert.equal(room.controller.safeMode, undefined);
});

test('sets evacuation flag when timeToLand is below threshold', function () {
    const room = makeOwnedRoom('W1N1');
    room._findResults[FIND_NUKES] = [makeNuke(3000, 25, 25, 'W1N1')];
    const originalLog = console.log;
    console.log = function () {};
    try {
        nukeService.tick();
    } finally {
        console.log = originalLog;
    }
    assert.equal(memory.getNukeEvac('W1N1'), true);
});

test('clears evacuation flag when no nukes are present', function () {
    const room = makeOwnedRoom('W1N1');
    // First tick: nuke present, set evac
    room._findResults[FIND_NUKES] = [makeNuke(3000, 25, 25, 'W1N1')];
    const originalLog = console.log;
    console.log = function () {};
    try {
        nukeService.tick();
    } finally {
        console.log = originalLog;
    }
    assert.equal(memory.getNukeEvac('W1N1'), true);
    // Second tick: no nukes, clear evac
    room._findResults[FIND_NUKES] = [];
    nukeService.tick();
    assert.equal(memory.getNukeEvac('W1N1'), false);
});

test('ignores rooms not owned by the player', function () {
    Game.rooms['W1N1'] = {
        name: 'W1N1',
        controller: { my: false },
        find: function () { return []; },
    };
    nukeService.tick();
    const events = memory.getNukeEvents();
    assert.equal(events['W1N1'], undefined);
});

test('cleans up stale events', function () {
    const room = makeOwnedRoom('W1N1');
    room._findResults[FIND_NUKES] = [makeNuke(40000, 25, 25, 'W1N1')];
    nukeService.tick();
    assert.ok(memory.getNukeEvents()['W1N1']);
    // Simulate time passing beyond TTL
    const oldTick = Game.time;
    Game.time = oldTick + 70000;
    room._findResults[FIND_NUKES] = []; // no nukes anymore
    nukeService.tick();
    assert.equal(memory.getNukeEvents()['W1N1'], undefined);
});