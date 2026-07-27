'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../mocks/screeps');
const memory = require('../../src/utils/memorySchema');
const spawnManager = require('../../src/managers/spawnManager');
const roomManager = require('../../src/managers/roomManager');

function makeRoom(name) {
    return {
        name: name,
        find: function (_type) { return this._findResult || []; },
        _findResult: [],
    };
}

test('hostilesInRoom returns the snapshot hostiles when a snapshot exists', function () {
    mocks.resetGame();
    const room = makeRoom('W1N1');
    let findCalls = 0;
    room.find = function () { findCalls += 1; return []; };
    const hostile = { id: 'h1', hits: 100, hitsMax: 100 };
    const origGet = roomManager.get;
    roomManager.get = function (rn) {
        if (rn === 'W1N1') return { hostiles: [hostile] };
        return null;
    };
    try {
        const result = spawnManager.hostilesInRoom(room);
        assert.equal(result.length, 1);
        assert.equal(result[0], hostile);
        assert.equal(findCalls, 0);
    } finally {
        roomManager.get = origGet;
    }
});

test('hostilesInRoom falls back to room.find when snapshot is null', function () {
    mocks.resetGame();
    const room = makeRoom('W1N1');
    const hostile = { id: 'h1', hits: 100, hitsMax: 100 };
    room._findResult = [hostile];
    const origGet = roomManager.get;
    roomManager.get = function () { return null; };
    try {
        const result = spawnManager.hostilesInRoom(room);
        assert.equal(result.length, 1);
        assert.equal(result[0], hostile);
    } finally {
        roomManager.get = origGet;
    }
});

// --- Fighter/healer squad pairing (spawn-time assignment) ---

function makeFighter(name, id, ticksToLive) {
    const c = mocks.mockCreep({
        name: name,
        pos: { x: 25, y: 25, roomName: 'W1N1' },
        parts: { attack: 3, tough: 3, move: 6 },
    });
    c.id = id;
    c.ticksToLive = ticksToLive;
    memory.setRole(c, 'fighter');
    return c;
}

function makeHealer(name, id, squadLeader) {
    const c = mocks.mockCreep({
        name: name,
        pos: { x: 25, y: 25, roomName: 'W1N1' },
        parts: { heal: 2, tough: 2, move: 4 },
    });
    c.id = id;
    if (squadLeader) c.memory.squadLeader = squadLeader;
    memory.setRole(c, 'healer');
    return c;
}

test('findUnpairedFighter returns the newest fighter with no healer paired to it', function () {
    mocks.resetGame();
    const f1 = makeFighter('Fighter1', 'f1', 1200);
    const f2 = makeFighter('Fighter2', 'f2', 800);
    Game.creeps['Fighter1'] = f1;
    Game.creeps['Fighter2'] = f2;
    // f1 already has a healer paired.
    Game.creeps['Healer1'] = makeHealer('Healer1', 'h1', 'f1');
    const pick = spawnManager.findUnpairedFighter();
    assert.equal(pick.id, 'f2');
});

test('findUnpairedFighter returns null when every fighter is paired', function () {
    mocks.resetGame();
    Game.creeps['Fighter1'] = makeFighter('Fighter1', 'f1', 1200);
    Game.creeps['Healer1'] = makeHealer('Healer1', 'h1', 'f1');
    assert.equal(spawnManager.findUnpairedFighter(), null);
});

test('findUnpairedFighter returns null when no fighters exist', function () {
    mocks.resetGame();
    assert.equal(spawnManager.findUnpairedFighter(), null);
});