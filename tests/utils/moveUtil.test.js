'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../mocks/screeps');
const move = require('../../src/utils/moveUtil');

function makeMockRoom() {
    return {
        name: 'W1N1',
        lookForAt: function () { return []; }, // no roads by default
    };
}

test('moveCreep passes a default reusePath=5 when not on a road and no caller override', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({
        name: 'Hauler1-Spawn1',
        pos: { x: 25, y: 25, roomName: 'W1N1' },
    });
    creep.room = makeMockRoom();
    let capturedOpts = null;
    creep.moveTo = function (_target, opts) { capturedOpts = opts; return OK; };
    // Target far enough that isNearTo is false so moveTo runs.
    const target = mocks.mockStructure(STRUCTURE_SPAWN, { pos: { x: 40, y: 25, roomName: 'W1N1' } });
    move.moveCreep(creep, target);
    assert.equal(capturedOpts.reusePath, 5);
    assert.equal(capturedOpts.maxOps, 2000);
    assert.equal(capturedOpts.ignoreCreeps, false);
    assert.equal(capturedOpts.visualizePathStyle, undefined);
});

test('moveCreep passes caller reusePath override through to moveTo', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({
        name: 'Hauler1-Spawn1',
        pos: { x: 25, y: 25, roomName: 'W1N1' },
    });
    creep.room = makeMockRoom();
    let capturedOpts = null;
    creep.moveTo = function (_target, opts) { capturedOpts = opts; return OK; };
    const target = mocks.mockStructure(STRUCTURE_SPAWN, { pos: { x: 40, y: 25, roomName: 'W1N1' } });
    move.moveCreep(creep, target, { reusePath: 20, visualizePathStyle: { stroke: '#ff0000' } });
    assert.equal(capturedOpts.reusePath, 20);
    assert.deepEqual(capturedOpts.visualizePathStyle, { stroke: '#ff0000' });
});

test('moveCreep uses reusePath=2 when the target is on a road (no caller override)', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({
        name: 'Hauler1-Spawn1',
        pos: { x: 25, y: 25, roomName: 'W1N1' },
    });
    // Room reports a road at the target tile.
    creep.room = {
        name: 'W1N1',
        lookForAt: function (_type, x, _y) {
            if (x === 40) return [{ structureType: STRUCTURE_ROAD }];
            return [];
        },
    };
    let capturedOpts = null;
    creep.moveTo = function (_target, opts) { capturedOpts = opts; return OK; };
    const target = mocks.mockStructure(STRUCTURE_SPAWN, { pos: { x: 40, y: 25, roomName: 'W1N1' } });
    move.moveCreep(creep, target);
    assert.equal(capturedOpts.reusePath, 2);
});