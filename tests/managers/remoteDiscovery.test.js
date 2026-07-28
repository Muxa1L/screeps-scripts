'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mock = require('../mocks/screeps');
const remoteDiscovery = require('../../src/managers/remoteDiscovery');
const memory = require('../../src/utils/memorySchema');

beforeEach(function () {
    mock.resetGame();
    mock.resetMemory();
    // Set up default flags
    Memory.flags = { remoteMining: true };
    // Mock getRoomLinearDistance for distance scoring
    Game.map.getRoomLinearDistance = function (_a, _b) {
        // Simple mock: return 1 for neighbors, 99 for far rooms
        return 1;
    };
});

function setupOwnedRoom(name, rcl) {
    Game.rooms[name] = {
        name: name,
        controller: { my: true, level: rcl || 4 },
        find: function (type) {
            if (type === FIND_SOURCES) return [{ id: 'src1', pos: { x: 10, y: 10 } }, { id: 'src2', pos: { x: 20, y: 20 } }];
            if (type === FIND_STRUCTURES) return [{ structureType: STRUCTURE_OBSERVER }];
            return [];
        },
    };
}

function setupNeighbor(name) {
    Game.rooms[name] = {
        name: name,
        controller: { my: false, owner: null, reservation: null },
        find: function (type) {
            if (type === FIND_SOURCES) return [{ id: 'src1', pos: { x: 10, y: 10 } }, { id: 'src2', pos: { x: 20, y: 20 } }];
            return [];
        },
    };
}

test('findCandidates returns neighbors of owned rooms', function () {
    setupOwnedRoom('W1N1', 4);
    Game.map.describeExits = function (name) {
        if (name === 'W1N1') return { '1': 'W2N1', '3': 'W1N2' };
        return {};
    };
    setupNeighbor('W2N1');
    setupNeighbor('W1N2');
    const candidates = remoteDiscovery.findCandidates();
    assert.ok(candidates.includes('W2N1'));
    assert.ok(candidates.includes('W1N2'));
});

test('findCandidates skips highway rooms', function () {
    setupOwnedRoom('W1N1', 4);
    Game.map.describeExits = function (name) {
        if (name === 'W1N1') return { '1': 'W10N1' }; // W10N1 is highway (x%10==0)
        return {};
    };
    setupNeighbor('W10N1');
    const candidates = remoteDiscovery.findCandidates();
    assert.equal(candidates.length, 0);
});

test('findCandidates skips rooms owned by others', function () {
    setupOwnedRoom('W1N1', 4);
    Game.map.describeExits = function (name) {
        if (name === 'W1N1') return { '1': 'W2N1' };
        return {};
    };
    Game.rooms['W2N1'] = {
        name: 'W2N1',
        controller: { my: false, owner: 'otherplayer' },
        find: function () { return []; },
    };
    const candidates = remoteDiscovery.findCandidates();
    assert.equal(candidates.length, 0);
});

test('findCandidates skips rooms already in remoteRooms', function () {
    setupOwnedRoom('W1N1', 4);
    Game.map.describeExits = function (name) {
        if (name === 'W1N1') return { '1': 'W2N1' };
        return {};
    };
    setupNeighbor('W2N1');
    memory.ensureRemoteRooms()['W2N1'] = { status: 'active' };
    const candidates = remoteDiscovery.findCandidates();
    assert.equal(candidates.length, 0);
});

test('findCandidates skips expansion targets', function () {
    setupOwnedRoom('W1N1', 4);
    Game.map.describeExits = function (name) {
        if (name === 'W1N1') return { '1': 'W2N1' };
        return {};
    };
    setupNeighbor('W2N1');
    memory.ensureExpansion().target = { roomName: 'W2N1' };
    const candidates = remoteDiscovery.findCandidates();
    assert.equal(candidates.length, 0);
});

test('scoreCandidate favors more sources and closer distance', function () {
    setupOwnedRoom('W1N1', 4);
    Game.map.getRoomLinearDistance = function (a, b) {
        if (a === 'W1N1' && b === 'W2N1') return 1;
        if (a === 'W1N1' && b === 'W3N1') return 2;
        return 99;
    };
    Game.rooms['W2N1'] = { find: function (t) { return t === FIND_SOURCES ? [{}, {}] : []; } };
    Game.rooms['W3N1'] = { find: function (t) { return t === FIND_SOURCES ? [{}] : []; } };
    const s1 = remoteDiscovery.scoreCandidate('W2N1');
    const s2 = remoteDiscovery.scoreCandidate('W3N1');
    assert.ok(s1 > s2, '2 sources at dist 1 should score higher than 1 source at dist 2');
});

test('ensureRemoteRoom creates a pending entry with autoDiscovered flag', function () {
    setupOwnedRoom('W1N1', 4);
    Game.map.getRoomLinearDistance = function () { return 1; };
    remoteDiscovery.ensureRemoteRoom('W2N1');
    const rr = memory.getRemoteRooms();
    assert.ok(rr['W2N1']);
    assert.equal(rr['W2N1'].status, 'pending');
    assert.equal(rr['W2N1'].autoDiscovered, true);
    assert.ok(rr['W2N1'].vetoUntil || rr['W2N1'].vetoUntil === 0);
});

test('ensureRemoteRoom does not overwrite existing entries', function () {
    setupOwnedRoom('W1N1', 4);
    memory.ensureRemoteRooms()['W2N1'] = { status: 'active', custom: true };
    remoteDiscovery.ensureRemoteRoom('W2N1');
    assert.equal(memory.getRemoteRooms()['W2N1'].custom, true);
    assert.equal(memory.getRemoteRooms()['W2N1'].status, 'active');
});

test('countAutoDiscovered counts only non-abandoned auto entries', function () {
    const rr = memory.ensureRemoteRooms();
    rr['W2N1'] = { autoDiscovered: true, status: 'active' };
    rr['W3N1'] = { autoDiscovered: true, status: 'abandoned' };
    rr['W4N1'] = { autoDiscovered: false, status: 'active' };
    assert.equal(remoteDiscovery.countAutoDiscovered(), 1);
});

test('tick does nothing when remoteMining flag is off', function () {
    Memory.flags.remoteMining = false;
    remoteDiscovery.tick();
    const rr = memory.getRemoteRooms();
    assert.equal(Object.keys(rr).length, 0);
});

test('tick does nothing when no owned rooms meet prerequisites', function () {
    // RCL 3 room — doesn't meet RCL >= 4 gate
    setupOwnedRoom('W1N1', 3);
    // Without proper source registry setup, remotePrerequisitesMet returns false
    remoteDiscovery.tick();
    const rr = memory.getRemoteRooms();
    // Should not auto-discover because prerequisites not met
    // (remotePrerequisitesMet checks for observer + 2 claimed sources)
    assert.equal(Object.keys(rr).length, 0);
});