'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../../mocks/screeps');
const memory = require('../../../src/utils/memorySchema');
const taskMine = require('../../../src/tasks/types/taskMine');

// Pickup fallback: when a miner is on its slot and the source is depleted,
// pick up dropped energy on adjacent tiles rather than sitting idle. The
// miner stays on its `mine` task and keeps its slot claim; the pickup is
// self-contained inside taskMine.run (no role/priority change).

function pos(x, y) {
    return { x: x, y: y, roomName: 'W1N1' };
}

test('miner on its slot picks up adjacent dropped energy when the source is depleted', function () {
    mocks.resetGame();
    // Source at (25,25), depleted. Miner on its slot at (26,26) (adjacent).
    // mockSource defaults energy via `options.energy || 1000` which turns 0
    // into 1000, so set .energy = 0 explicitly after construction.
    const source = mocks.mockSource({ id: 'src1', pos: pos(25, 25) });
    source.energy = 0;
    // Drop the dropped resource on the miner's tile so pickup is immediate.
    const dropped = mocks.mockDroppedResource(50, pos(26, 26));
    source.room = {
        find: function (type, opts) {
            let items = type === FIND_DROPPED_RESOURCES ? [dropped] : [];
            if (opts && opts.filter) items = items.filter(opts.filter);
            return items;
        },
    };
    // Pre-register the miner's slot claim so claimSlot returns true and
    // slotPos resolves to (26,26).
    Memory.sources = {
        'src1': {
            roomName: 'W1N1', x: 25, y: 25,
            slots: [{ x: 26, y: 26, claimedBy: 'Miner1' }],
        },
    };
    const miner = mocks.mockCreep({
        name: 'Miner1', pos: pos(26, 26),
        capacity: 100, store: {},
        parts: { work: 4, carry: 1, move: 2 },
    });
    miner.id = 'miner1';
    memory.setRole(miner, 'miner');
    Game.creeps['Miner1'] = miner;

    let pickedUp = null;
    miner.pickup = function (target) { pickedUp = target; return OK; };

    const snap = { energyStructures: [], containers: [], storage: null, links: [], sources: [source] };
    const result = taskMine.run(miner, { target: { id: 'src1', pos: pos(25, 25) } }, snap);

    assert.equal(result, true);
    assert.equal(pickedUp, dropped);
});

test('miner on its slot with no adjacent dropped energy falls through to harvest (idle wait)', function () {
    mocks.resetGame();
    const source = mocks.mockSource({ id: 'src2', pos: pos(25, 25) });
    source.energy = 0;
    source.room = {
        find: function (_type, _opts) { return []; },
    };
    Memory.sources = {
        'src2': {
            roomName: 'W1N1', x: 25, y: 25,
            slots: [{ x: 26, y: 26, claimedBy: 'Miner2' }],
        },
    };
    const miner = mocks.mockCreep({
        name: 'Miner2', pos: pos(26, 26),
        capacity: 100, store: {},
        parts: { work: 4, carry: 1, move: 2 },
    });
    miner.id = 'miner2';
    memory.setRole(miner, 'miner');
    Game.creeps['Miner2'] = miner;

    let pickedUp = null;
    miner.pickup = function (target) { pickedUp = target; return OK; };
    // harvest returns OK — the source is "depleted" but the mock returns OK.
    // The key assertion is that pickup was NOT called (no adjacent drops).
    let harvestCalls = 0;
    miner.harvest = function () { harvestCalls += 1; return OK; };

    const snap = { energyStructures: [], containers: [], storage: null, links: [], sources: [source] };
    const result = taskMine.run(miner, { target: { id: 'src2', pos: pos(25, 25) } }, snap);

    assert.equal(result, true);
    assert.equal(pickedUp, null);
    // Falls through to harvest (which the mock returns OK for).
    assert.equal(harvestCalls, 1);
});

test('miner does NOT pick up dropped energy when the source still has energy', function () {
    mocks.resetGame();
    // Source with energy remaining — pickup fallback must not fire even if
    // a drop is adjacent, so the miner keeps harvesting instead of diverting.
    const source = mocks.mockSource({ id: 'src3', pos: pos(25, 25), energy: 500 });
    const dropped = mocks.mockDroppedResource(50, pos(26, 26));
    source.room = {
        find: function (type, opts) {
            let items = type === FIND_DROPPED_RESOURCES ? [dropped] : [];
            if (opts && opts.filter) items = items.filter(opts.filter);
            return items;
        },
    };
    Memory.sources = {
        'src3': {
            roomName: 'W1N1', x: 25, y: 25,
            slots: [{ x: 26, y: 26, claimedBy: 'Miner3' }],
        },
    };
    const miner = mocks.mockCreep({
        name: 'Miner3', pos: pos(26, 26),
        capacity: 100, store: {},
        parts: { work: 4, carry: 1, move: 2 },
    });
    miner.id = 'miner3';
    memory.setRole(miner, 'miner');
    Game.creeps['Miner3'] = miner;

    let pickedUp = null;
    miner.pickup = function (target) { pickedUp = target; return OK; };
    let harvestCalls = 0;
    miner.harvest = function () { harvestCalls += 1; return OK; };

    const snap = { energyStructures: [], containers: [], storage: null, links: [], sources: [source] };
    const result = taskMine.run(miner, { target: { id: 'src3', pos: pos(25, 25) } }, snap);

    assert.equal(result, true);
    assert.equal(pickedUp, null);
    assert.equal(harvestCalls, 1);
});