'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../mocks/screeps');
const memory = require('../../src/utils/memorySchema');
const remoteManager = require('../../src/managers/remoteManager');

function makeRoom(name, opts) {
    opts = opts || {};
    const room = {
        name: name,
        controller: opts.controller || { my: true },
        find: function (type) {
            if (type === FIND_SOURCES) return opts.sources || [];
            if (type === FIND_STRUCTURES) return opts.structures || [];
            if (type === FIND_CONSTRUCTION_SITES) return opts.sites || [];
            if (type === FIND_HOSTILE_CREEPS) return opts.hostiles || [];
            return [];
        },
        storage: opts.storage || null,
    };
    Game.rooms[name] = room;
    return room;
}

function makeSource(id, roomName) {
    return mocks.mockSource({ id: id, pos: { x: 25, y: 25, roomName: roomName } });
}

test('ensureRemoteRoom creates a pending entry', function () {
    mocks.resetGame();
    const entry = remoteManager.ensureRemoteRoom('E2N1');
    assert.equal(entry.status, 'pending');
    assert.equal(entry.target, 'E2N1');
});

test('homeRoomForRemote picks closest owned room', function () {
    mocks.resetGame();
    Game.map.getRoomLinearDistance = function (a, b) {
        const parse = function (s) {
            const m = s.match(/E(\d+)N(\d+)/);
            return { x: parseInt(m[1], 10), y: parseInt(m[2], 10) };
        };
        const pa = parse(a), pb = parse(b);
        return Math.max(Math.abs(pa.x - pb.x), Math.abs(pa.y - pb.y));
    };
    makeRoom('E1N1');
    makeRoom('E5N1');
    assert.equal(remoteManager.homeRoomForRemote('E2N1'), 'E1N1');
});

test('canActivate respects distance cap', function () {
    mocks.resetGame();
    Game.map.getRoomLinearDistance = function () { return 50; };
    makeRoom('E1N1');
    Memory.remoteRooms = { 'E2N1': { status: 'pending' } };
    assert.equal(remoteManager.canActivate('E2N1'), false);
});

test('tick transitions scouted room to reserving', function () {
    mocks.resetGame();
    Memory.flags = { remoteMining: true };
    Memory.remoteRooms = {
        'E2N1': {
            target: 'E2N1', status: 'scouted',
            sourceIds: [], containerSiteIds: [], roadSiteIds: [], threats: [],
        },
    };
    remoteManager.tick();
    assert.equal(Memory.remoteRooms['E2N1'].status, 'reserving');
});

test('tick sets contested status on visible armed hostiles', function () {
    mocks.resetGame();
    Memory.flags = { remoteMining: true };
    const hostile = mocks.mockCreep({ name: 'E1', pos: { x: 10, y: 10, roomName: 'E2N1' }, parts: { attack: 1 } });
    hostile.hits = 100;
    makeRoom('E2N1', { hostiles: [hostile] });
    Memory.remoteRooms = {
        'E2N1': {
            target: 'E2N1', status: 'active',
            sourceIds: [], containerSiteIds: [], roadSiteIds: [], threats: [],
        },
    };
    remoteManager.tick();
    assert.equal(Memory.remoteRooms['E2N1'].status, 'contested');
});

test('tick ignores a lone unarmed scout (no false-positive contested)', function () {
    mocks.resetGame();
    Memory.flags = { remoteMining: true };
    const scout = mocks.mockCreep({ name: 'Scout', pos: { x: 10, y: 10, roomName: 'E2N1' }, parts: {} });
    scout.hits = 100;
    makeRoom('E2N1', { hostiles: [scout] });
    Memory.remoteRooms = {
        'E2N1': {
            target: 'E2N1', status: 'active',
            sourceIds: [], containerSiteIds: [], roadSiteIds: [], threats: [],
        },
    };
    remoteManager.tick();
    assert.equal(Memory.remoteRooms['E2N1'].status, 'active');
});

test('remoteManager no-op when remoteMining flag is off', function () {
    mocks.resetGame();
    Memory.flags = { remoteMining: false };
    Memory.remoteRooms = { 'E2N1': { status: 'pending' } };
    remoteManager.tick();
    assert.equal(Memory.remoteRooms['E2N1'].status, 'pending');
});
