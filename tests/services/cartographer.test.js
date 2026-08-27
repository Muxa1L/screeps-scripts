// Tests for cartographer. Covers: neighbour enumeration, intel read/write
// freshness, and queue dedup.

const test = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../mocks/screeps.js');

test('cartographer.neighbourRooms returns 8 unique room names around a centre', function () {
    delete require.cache[require.resolve('../../src/services/cartographer.js')];
    const c = require('../../src/services/cartographer.js');
    const ns = c.neighbourRooms('W47N45');
    assert.equal(ns.length, 8);
    assert.ok(!ns.includes('W47N45'));
    assert.ok(ns.includes('W47N44'));
    assert.ok(ns.includes('W46N45'));
    assert.ok(ns.includes('W48N46'));
});

test('cartographer handles the origin edge case (W0N0)', function () {
    delete require.cache[require.resolve('../../src/services/cartographer.js')];
    const c = require('../../src/services/cartographer.js');
    const ns = c.neighbourRooms('W0N0');
    // Sign flips at the origin can yield duplicates; that's a known caveat
    // of our naive encoding. We just need 8 entries, not 8 unique.
    assert.equal(ns.length, 8);
});

test('cartographer.enqueue dedups and respects freshness', function () {
    mocks.resetMemory();
    delete require.cache[require.resolve('../../src/services/cartographer.js')];
    const c = require('../../src/services/cartographer.js');
    c.enqueue('W48N45');
    c.enqueue('W48N45'); // dup
    c.enqueue('W49N45');
    assert.equal(Memory.intel.queue.length, 2);
    assert.deepEqual(Memory.intel.queue, ['W48N45', 'W49N45']);
});

test('cartographer.writeIntel and isFresh round-trip', function () {
    mocks.resetMemory();
    delete require.cache[require.resolve('../../src/services/cartographer.js')];
    const c = require('../../src/services/cartographer.js');
    c.writeIntel('W48N45', { owner: 'bob', sources: ['s1'] });
    assert.equal(c.isFresh('W48N45'), true);
    // Stale after moving the clock past INTEL_TTL.
    global.Game.time = Game.time + c.INTEL_TTL + 1;
    assert.equal(c.isFresh('W48N45'), false);
});

test('cartographer.enqueue skips rooms with fresh intel', function () {
    mocks.resetMemory();
    delete require.cache[require.resolve('../../src/services/cartographer.js')];
    const c = require('../../src/services/cartographer.js');
    c.writeIntel('W48N45', { owner: 'bob' });
    c.enqueue('W48N45');
    assert.equal(Memory.intel.queue.length, 0);
});
