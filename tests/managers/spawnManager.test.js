'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../mocks/screeps');
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