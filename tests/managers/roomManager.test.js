'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../mocks/screeps');
const roomManager = require('../../src/managers/roomManager');

function makeRoom(name, opts) {
    opts = opts || {};
    const room = {
        name: name,
        controller: opts.controller || { my: true, level: 4 },
        storage: opts.storage || null,
        find: function (type) {
            if (type === FIND_HOSTILE_CREEPS) return opts.hostiles || [];
            if (type === FIND_MY_CREEPS) return opts.myCreeps || [];
            if (type === FIND_MY_CONSTRUCTION_SITES) return opts.sites || [];
            if (type === FIND_DROPPED_RESOURCES) return opts.dropped || [];
            if (type === FIND_TOMBSTONES) return opts.tombstones || [];
            if (type === FIND_RUINS) return opts.ruins || [];
            if (type === FIND_STRUCTURES) return opts.structures || [];
            if (type === FIND_SOURCES) return opts.sources || [];
            if (type === FIND_HOSTILE_STRUCTURES) return opts.hostileStructures || [];
            return [];
        },
    };
    Game.rooms[name] = room;
    return room;
}

test('tick builds a snapshot for every visible room', function () {
    mocks.resetGame();
    makeRoom('E1N1', { hostiles: [], structures: [] });
    makeRoom('E2N1', { hostiles: [], structures: [] });
    roomManager.tick();
    assert.ok(roomManager.get('E1N1'));
    assert.ok(roomManager.get('E2N1'));
});

test('snapshot captures hostiles and hostilePositions', function () {
    mocks.resetGame();
    const hostile = mocks.mockCreep({ name: 'H1', pos: { x: 10, y: 10, roomName: 'E1N1' }, parts: {} });
    hostile.hits = 100;
    makeRoom('E1N1', { hostiles: [hostile] });
    roomManager.tick();
    const snap = roomManager.get('E1N1');
    assert.equal(snap.hostiles.length, 1);
    assert.equal(snap.hostilePositions.length, 1);
    assert.equal(snap.hostilePositions[0].x, 10);
});

test('snapshot categorizes damaged structures into critical / non-critical', function () {
    mocks.resetGame();
    const wall = mocks.mockStructure(STRUCTURE_WALL, { id: 'w1', pos: { x: 5, y: 5, roomName: 'E1N1' }, hits: 5000, hitsMax: 10000 });
    const road = mocks.mockStructure(STRUCTURE_ROAD, { id: 'r1', pos: { x: 6, y: 6, roomName: 'E1N1' }, hits: 1000, hitsMax: 5000 });
    makeRoom('E1N1', { structures: [wall, road] });
    roomManager.tick();
    const snap = roomManager.get('E1N1');
    // Wall below 10000 is critical; road is non-critical.
    assert.ok(snap.damagedCritical.indexOf(wall) !== -1);
    assert.ok(snap.damagedNonCritical.indexOf(road) !== -1);
});

test('snapshot includes energy structures that need energy', function () {
    mocks.resetGame();
    const ext = mocks.mockStructure(STRUCTURE_EXTENSION, { id: 'e1', pos: { x: 5, y: 5, roomName: 'E1N1' }, energy: 0, capacity: 50 });
    const fullExt = mocks.mockStructure(STRUCTURE_EXTENSION, { id: 'e2', pos: { x: 6, y: 6, roomName: 'E1N1' }, energy: 50, capacity: 50 });
    makeRoom('E1N1', { structures: [ext, fullExt] });
    roomManager.tick();
    const snap = roomManager.get('E1N1');
    assert.ok(snap.energyStructures.indexOf(ext) !== -1);
    assert.ok(snap.energyStructures.indexOf(fullExt) === -1);
});

test('snapshot exposes containers and links', function () {
    mocks.resetGame();
    const container = mocks.mockStructure(STRUCTURE_CONTAINER, { id: 'c1', pos: { x: 5, y: 5, roomName: 'E1N1' } });
    const link = mocks.mockStructure(STRUCTURE_LINK, { id: 'l1', pos: { x: 6, y: 6, roomName: 'E1N1' } });
    makeRoom('E1N1', { structures: [container, link] });
    roomManager.tick();
    const snap = roomManager.get('E1N1');
    assert.ok(snap.containers.indexOf(container) !== -1);
    assert.ok(snap.links.indexOf(link) !== -1);
});

test('get returns null for unknown rooms', function () {
    mocks.resetGame();
    roomManager.tick();
    assert.equal(roomManager.get('E99N99'), null);
});

test('isPosNearHostile returns true when a hostile is within range', function () {
    mocks.resetGame();
    const hostile = mocks.mockCreep({ name: 'H1', pos: { x: 10, y: 10, roomName: 'E1N1' }, parts: {} });
    hostile.hits = 100;
    makeRoom('E1N1', { hostiles: [hostile] });
    roomManager.tick();
    const near = roomManager.isPosNearHostile('E1N1', { x: 12, y: 12, roomName: 'E1N1' }, 5);
    assert.equal(near, true);
    const far = roomManager.isPosNearHostile('E1N1', { x: 40, y: 40, roomName: 'E1N1' }, 5);
    assert.equal(far, false);
});

test('tick is idempotent within the same Game.time', function () {
    mocks.resetGame();
    makeRoom('E1N1');
    roomManager.tick();
    const snap1 = roomManager.get('E1N1');
    roomManager.tick();
    const snap2 = roomManager.get('E1N1');
    assert.equal(snap1, snap2);
});