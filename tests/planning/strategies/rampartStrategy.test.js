'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../../mocks/screeps');
const rampartStrategy = require('../../../src/planning/strategies/rampartStrategy');

function makeRoom(structures) {
    mocks.resetGame();
    return {
        name: 'W1N1',
        find: function (type) {
            if (type === FIND_STRUCTURES) return structures;
            return [];
        },
        createConstructionSite: function (_pos, _type) { return OK; },
    };
}

test('planRamparts places a rampart over an uncovered spawn', function () {
    const spawn = mocks.mockStructure('spawn', { id: 'spawn1', pos: { x: 25, y: 25, roomName: 'W1N1' } });
    const room = makeRoom([spawn]);
    const calls = [];
    room.createConstructionSite = function (pos, type) { calls.push({ pos: pos, type: type }); return OK; };
    const counts = { rampart: 0 };
    const placed = rampartStrategy.planRamparts(room, counts, { rampart: 15 }, 3);
    assert.equal(placed, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].type, STRUCTURE_RAMPART);
    assert.equal(counts.rampart, 1);
});

test('planRamparts skips a structure whose tile already has a rampart', function () {
    const spawn = mocks.mockStructure('spawn', { id: 'spawn1', pos: { x: 25, y: 25, roomName: 'W1N1' } });
    const room = makeRoom([spawn]);
    // Tile 25,25 already has a rampart → hasStructureOrSiteAt returns true.
    global._structureMap['W1N1'] = { '25,25': [{ structureType: STRUCTURE_RAMPART }] };
    let calls = 0;
    room.createConstructionSite = function () { calls += 1; return OK; };
    const placed = rampartStrategy.planRamparts(room, { rampart: 0 }, { rampart: 15 }, 3);
    assert.equal(placed, 0);
    assert.equal(calls, 0);
});

test('planRamparts respects the site budget', function () {
    const structs = [
        mocks.mockStructure('spawn', { pos: { x: 25, y: 25, roomName: 'W1N1' } }),
        mocks.mockStructure('extension', { pos: { x: 26, y: 25, roomName: 'W1N1' } }),
        mocks.mockStructure('extension', { pos: { x: 27, y: 25, roomName: 'W1N1' } }),
    ];
    const room = makeRoom(structs);
    let calls = 0;
    room.createConstructionSite = function () { calls += 1; return OK; };
    const placed = rampartStrategy.planRamparts(room, { rampart: 0 }, { rampart: 15 }, 2);
    assert.equal(placed, 2);
    assert.equal(calls, 2);
});

test('planRamparts respects the rampart soft cap', function () {
    const structs = [
        mocks.mockStructure('spawn', { pos: { x: 25, y: 25, roomName: 'W1N1' } }),
        mocks.mockStructure('extension', { pos: { x: 26, y: 25, roomName: 'W1N1' } }),
        mocks.mockStructure('extension', { pos: { x: 27, y: 25, roomName: 'W1N1' } }),
    ];
    const room = makeRoom(structs);
    let calls = 0;
    room.createConstructionSite = function () { calls += 1; return OK; };
    const placed = rampartStrategy.planRamparts(room, { rampart: 0 }, { rampart: 1 }, 3);
    assert.equal(placed, 1);
    assert.equal(calls, 1);
});

test('planRamparts ignores roads, containers, and walls', function () {
    const structs = [
        mocks.mockStructure('road', { pos: { x: 25, y: 25, roomName: 'W1N1' } }),
        mocks.mockStructure('container', { pos: { x: 26, y: 25, roomName: 'W1N1' } }),
        mocks.mockStructure('constructedWall', { pos: { x: 27, y: 25, roomName: 'W1N1' } }),
    ];
    const room = makeRoom(structs);
    let calls = 0;
    room.createConstructionSite = function () { calls += 1; return OK; };
    const placed = rampartStrategy.planRamparts(room, { rampart: 0 }, { rampart: 15 }, 3);
    assert.equal(placed, 0);
    assert.equal(calls, 0);
});

test('planRamparts returns 0 when rampart limit is 0', function () {
    const spawn = mocks.mockStructure('spawn', { pos: { x: 25, y: 25, roomName: 'W1N1' } });
    const room = makeRoom([spawn]);
    let calls = 0;
    room.createConstructionSite = function () { calls += 1; return OK; };
    const placed = rampartStrategy.planRamparts(room, { rampart: 0 }, { rampart: 0 }, 3);
    assert.equal(placed, 0);
    assert.equal(calls, 0);
});