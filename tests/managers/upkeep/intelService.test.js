'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../../mocks/screeps');
const memory = require('../../../src/utils/memorySchema');
const intelService = require('../../../src/managers/upkeep/intelService');

function makeRoom(name, opts) {
    opts = opts || {};
    const room = {
        name: name,
        controller: opts.controller || { my: true, owner: { username: 'me' } },
        find: function (type) {
            if (type === FIND_STRUCTURES) return opts.structures || [];
            if (type === FIND_HOSTILE_CREEPS) return opts.hostiles || [];
            if (type === FIND_HOSTILE_STRUCTURES) return opts.hostileStructures || [];
            return [];
        },
        storage: opts.storage || null,
    };
    Game.rooms[name] = room;
    return room;
}

function makeObserver(id) {
    return {
        id: id,
        structureType: STRUCTURE_OBSERVER,
        observeRoom: function (_roomName) { return OK; },
    };
}

test('buildQueue includes adjacent exit rooms of owned rooms', function () {
    mocks.resetGame();
    Game.map.describeExits = function () { return { [FIND_EXIT_RIGHT]: 'E2N1', [FIND_EXIT_TOP]: 'E1N2' }; };
    makeRoom('E1N1');
    const queue = intelService.buildQueue();
    assert.ok(queue.indexOf('E2N1') !== -1);
    assert.ok(queue.indexOf('E1N2') !== -1);
});

test('buildQueue skips highway rooms', function () {
    mocks.resetGame();
    Game.map.describeExits = function () { return { [FIND_EXIT_RIGHT]: 'E10N1' }; };
    makeRoom('E9N1');
    const queue = intelService.buildQueue();
    assert.ok(queue.indexOf('E10N1') === -1);
});

test('recordIntel populates Memory.intel for a scanned room', function () {
    mocks.resetGame();
    Memory.flags = { intel: true };
    const hostile = mocks.mockCreep({ name: 'Enemy1', pos: { x: 10, y: 10, roomName: 'E2N1' }, parts: {} });
    hostile.hits = 100;
    const room = makeRoom('E2N1', {
        controller: { owner: { username: 'someone' } },
        hostiles: [hostile],
        hostileStructures: [],
    });
    const source = mocks.mockSource({ id: 'src1', pos: { x: 25, y: 25, roomName: 'E2N1' } });
    const snap = { hostiles: [hostile], hostileStructures: [], sources: [source] };

    intelService.recordIntel('E2N1', snap);

    const entry = memory.ensureIntelRooms()['E2N1'];
    assert.equal(entry.lastSeen, Game.time);
    assert.equal(entry.hostiles, 1);
    assert.equal(entry.owner, 'someone');
    assert.ok(entry.sources.indexOf('src1') !== -1);
});

test('raid detection writes Memory.intel.raids when hostiles threshold met near owned room', function () {
    mocks.resetGame();
    Memory.flags = { intel: true };
    Game.map.getRoomLinearDistance = function () { return 2; };
    const room = makeRoom('E1N1');
    const hostiles = [];
    for (let i = 0; i < 3; i++) {
        const h = mocks.mockCreep({ name: 'E' + i, pos: { x: i, y: i, roomName: 'E2N1' }, parts: {} });
        h.hits = 100;
        hostiles.push(h);
    }
    const source = mocks.mockSource({ id: 'src1', pos: { x: 25, y: 25, roomName: 'E2N1' } });
    const snap = { hostiles: hostiles, hostileStructures: [], sources: [source] };

    intelService.recordIntel('E2N1', snap);

    assert.equal(memory.getIntel().raids['E2N1'].threatLevel, 3);
});

test('decayRaids clears stale raid entries', function () {
    mocks.resetGame();
    Memory.intel = {
        raids: { old: { detectedTick: 0, threatLevel: 3 } },
        rooms: {},
    };
    Game.time = 2000;
    intelService.decayRaids(memory.getIntel());
    assert.equal(memory.getIntel().raids.old, undefined);
});

test('intelService no-op when intel flag is off', function () {
    mocks.resetGame();
    Memory.flags = { intel: false };
    Memory.intel = { queue: [], scanCursor: 0, raids: {}, rooms: {} };
    makeRoom('E1N1', { structures: [makeObserver('obs1')] });
    intelService.tick();
    assert.deepEqual(memory.getIntel().queue, []);
});
