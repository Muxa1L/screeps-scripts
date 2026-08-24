'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../mocks/screeps');
const planner = require('../../src/planning/constructionPlanner');

test('STRUCTURE_LIMITS unlocks 1 tower at RCL 3 and 4 (matches Screeps)', function () {
    assert.equal(planner.STRUCTURE_LIMITS[3].tower, 1);
    assert.equal(planner.STRUCTURE_LIMITS[4].tower, 1);
    assert.equal(planner.STRUCTURE_LIMITS[5].tower, 2);
    assert.equal(planner.STRUCTURE_LIMITS[6].tower, 2);
    assert.equal(planner.STRUCTURE_LIMITS[7].tower, 3);
    assert.equal(planner.STRUCTURE_LIMITS[8].tower, 6);
});

test('STRUCTURE_LIMITS RCL 3 has extensions, containers, and no storage/link', function () {
    assert.equal(planner.STRUCTURE_LIMITS[3].extension, 10);
    assert.equal(planner.STRUCTURE_LIMITS[3].container, 5);
    assert.equal(planner.STRUCTURE_LIMITS[3].storage, 0);
    assert.equal(planner.STRUCTURE_LIMITS[3].link, 0);
});

function makeStructureRoom(level, structures) {
    mocks.resetGame();
    mocks.resetMemory();
    if (Memory.flags === undefined) Memory.flags = {};
    Memory.flags.disableRoads = true; // skip road strategy to isolate tower/rampart
    const spawn = mocks.mockStructure('spawn', { id: 'spawn1', pos: { x: 25, y: 25, roomName: 'W1N1' } });
    const room = {
        name: 'W1N1',
        controller: { level: level, my: true, pos: { x: 30, y: 30, roomName: 'W1N1' } },
        find: function (type) {
            if (type === FIND_MY_SPAWNS) return [spawn];
            if (type === FIND_STRUCTURES) return structures;
            if (type === FIND_MY_CONSTRUCTION_SITES) return [];
            return [];
        },
        createConstructionSite: function (_pos, _type) { return OK; },
    };
    return room;
}

test('planRoom at RCL 3 with no towers attempts to place a tower site', function () {
    // Satisfy extension (10) and container (5) limits so only the tower path runs.
    const structures = [];
    for (let i = 0; i < 10; i++) {
        structures.push(mocks.mockStructure('extension', { pos: { x: 20 + i, y: 20, roomName: 'W1N1' } }));
    }
    for (let i = 0; i < 5; i++) {
        structures.push(mocks.mockStructure('container', { pos: { x: 20 + i, y: 21, roomName: 'W1N1' } }));
    }
    const room = makeStructureRoom(3, structures);
    let towerCalls = 0;
    room.createConstructionSite = function (_pos, type) {
        if (type === STRUCTURE_TOWER) towerCalls += 1;
        return OK;
    };
    planner.planRoom(room);
    assert.equal(towerCalls, 1, 'expected exactly one tower createConstructionSite call');
});

test('planRoom at RCL 3 with an existing tower does not place another', function () {
    const structures = [];
    for (let i = 0; i < 10; i++) {
        structures.push(mocks.mockStructure('extension', { pos: { x: 20 + i, y: 20, roomName: 'W1N1' } }));
    }
    for (let i = 0; i < 5; i++) {
        structures.push(mocks.mockStructure('container', { pos: { x: 20 + i, y: 21, roomName: 'W1N1' } }));
    }
    structures.push(mocks.mockStructure('tower', { pos: { x: 28, y: 28, roomName: 'W1N1' } }));
    const room = makeStructureRoom(3, structures);
    let towerCalls = 0;
    room.createConstructionSite = function (_pos, type) {
        if (type === STRUCTURE_TOWER) towerCalls += 1;
        return OK;
    };
    planner.planRoom(room);
    assert.equal(towerCalls, 0);
});

test('planRoom at RCL 3 places ramparts over critical structures only', function () {
    const structures = [];
    for (let i = 0; i < 10; i++) {
        structures.push(mocks.mockStructure('extension', { pos: { x: 20 + i, y: 20, roomName: 'W1N1' } }));
    }
    for (let i = 0; i < 5; i++) {
        structures.push(mocks.mockStructure('container', { pos: { x: 20 + i, y: 21, roomName: 'W1N1' } }));
    }
    // Only the tower qualifies (EXTENSION was removed from CRITICAL_TYPES).
    structures.push(mocks.mockStructure('tower', { pos: { x: 28, y: 28, roomName: 'W1N1' } }));
    const room = makeStructureRoom(3, structures);
    const rampartTypes = [];
    room.createConstructionSite = function (_pos, type) {
        if (type === STRUCTURE_RAMPART) rampartTypes.push(type);
        return OK;
    };
    planner.planRoom(room);
    // Extensions and containers are no longer rampart-protected; the single
    // existing tower is the only qualifying structure this tick → 1 site.
    assert.equal(rampartTypes.length, 1);
});