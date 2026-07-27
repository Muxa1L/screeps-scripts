'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../mocks/screeps');
const memory = require('../../src/utils/memorySchema');
const expansionPlanner = require('../../src/managers/expansionPlanner');

function makeOwnedRoom(name, level) {
    const room = {
        name: name,
        controller: { my: true, level: level || 4 },
        find: function () { return []; },
    };
    Game.rooms[name] = room;
    return room;
}

test('isHighway returns true for highway room names', function () {
    assert.equal(expansionPlanner.isHighway('E10N1'), true);
    assert.equal(expansionPlanner.isHighway('E1N10'), true);
    assert.equal(expansionPlanner.isHighway('E5N5'), false);
});

test('availableSlots is GCL minus owned count', function () {
    mocks.resetGame();
    Game.gcl = { level: 3 };
    makeOwnedRoom('E1N1');
    makeOwnedRoom('E2N1');
    assert.equal(expansionPlanner.availableSlots(), 1);
});

test('availableSlots is 0 when owned >= GCL', function () {
    mocks.resetGame();
    Game.gcl = { level: 2 };
    makeOwnedRoom('E1N1');
    makeOwnedRoom('E2N1');
    assert.equal(expansionPlanner.availableSlots(), 0);
});

test('ownedRoomCount counts only my rooms', function () {
    mocks.resetGame();
    makeOwnedRoom('E1N1');
    Game.rooms['E2N1'] = { name: 'E2N1', controller: { my: false, owner: { username: 'other' } } };
    assert.equal(expansionPlanner.ownedRoomCount(), 1);
});

test('findCandidates returns neighbors of owned rooms', function () {
    mocks.resetGame();
    Game.map.describeExits = function (name) {
        if (name === 'E1N1') return { 1: 'E2N1', 3: 'E1N2' };
        return {};
    };
    makeOwnedRoom('E1N1');
    const candidates = expansionPlanner.findCandidates();
    assert.ok(candidates.indexOf('E2N1') !== -1);
    assert.ok(candidates.indexOf('E1N2') !== -1);
});

test('findCandidates skips highway rooms', function () {
    mocks.resetGame();
    Game.map.describeExits = function () { return { 1: 'E10N1' }; };
    makeOwnedRoom('E9N1');
    const candidates = expansionPlanner.findCandidates();
    assert.ok(candidates.indexOf('E10N1') === -1);
});

test('scoreCandidate rewards more sources', function () {
    mocks.resetGame();
    Game.map.getRoomLinearDistance = function () { return 1; };
    const r1 = { name: 'E2N1', controller: { my: false }, find: function (t) { return t === FIND_SOURCES ? [mocks.mockSource({})] : []; } };
    const r2 = { name: 'E2N2', controller: { my: false }, find: function (t) { return t === FIND_SOURCES ? [mocks.mockSource({}), mocks.mockSource({})] : []; } };
    Game.rooms['E2N1'] = r1;
    Game.rooms['E2N2'] = r2;
    const s1 = expansionPlanner.scoreCandidate('E2N1');
    const s2 = expansionPlanner.scoreCandidate('E2N2');
    assert.ok(s2 > s1, 'two-source room should score higher');
});

test('pickBest returns the highest-scoring candidate', function () {
    mocks.resetGame();
    Game.map.getRoomLinearDistance = function () { return 1; };
    const r1 = { name: 'E2N1', controller: { my: false }, find: function (t) { return t === FIND_SOURCES ? [mocks.mockSource({})] : []; } };
    const r2 = { name: 'E2N2', controller: { my: false }, find: function (t) { return t === FIND_SOURCES ? [mocks.mockSource({}), mocks.mockSource({})] : []; } };
    Game.rooms['E2N1'] = r1;
    Game.rooms['E2N2'] = r2;
    const best = expansionPlanner.pickBest(['E2N1', 'E2N2']);
    assert.equal(best.roomName, 'E2N2');
});

test('tick is a no-op when expansion flag is off', function () {
    mocks.resetGame();
    Memory.flags = { expansion: false };
    Game.gcl = { level: 3 };
    expansionPlanner.tick();
    const exp = memory.getExpansion();
    assert.equal(exp.target, undefined);
});

test('tick is a no-op when GCL below minimum', function () {
    mocks.resetGame();
    Memory.flags = { expansion: true };
    Game.gcl = { level: 1 };
    Game.time = 0;
    expansionPlanner.tick();
    const exp = memory.getExpansion();
    assert.equal(exp.target, undefined);
});