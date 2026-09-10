'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../../mocks/screeps');
const intelService = require('../../../src/managers/upkeep/intelService');
const cartographer = require('../../../src/services/cartographer');

test('tick records home ownership and enqueues neighbours', function () {
    mocks.resetGame();
    // Simulate a visible home room with a controller.
    Game.rooms['W47N45'] = {
        name: 'W47N45',
        controller: { my: true, owner: { username: 'Muxa1L' } },
        find: function (type, opts) {
            if (type === FIND_SOURCES) return [];
            if (type === FIND_HOSTILE_CREEPS) return [];
            return [];
        },
    };
    delete require.cache[require.resolve('../../../src/services/cartographer')];
    const freshCartographer = require('../../../src/services/cartographer');
    // Patch intelService to use the fresh cartographer.
    intelService.tick();
    const intel = freshCartographer.getIntel('W47N45');
    assert.ok(intel, 'home room intel should be recorded');
    assert.equal(intel.owner, 'Muxa1L');
    // Neighbours should be enqueued.
    assert.ok(Memory.intel.queue.length >= 8, 'neighbours enqueued');
});

test('getIntel proxies to cartographer', function () {
    mocks.resetMemory();
    delete require.cache[require.resolve('../../../src/services/cartographer')];
    const freshCartographer = require('../../../src/services/cartographer');
    freshCartographer.writeIntel('W48N45', { owner: 'bob' });
    assert.deepEqual(intelService.getIntel('W48N45'), freshCartographer.getIntel('W48N45'));
});

test('isFresh proxies to cartographer', function () {
    mocks.resetMemory();
    delete require.cache[require.resolve('../../../src/services/cartographer')];
    const freshCartographer = require('../../../src/services/cartographer');
    freshCartographer.writeIntel('W48N45', { owner: 'bob' });
    assert.equal(intelService.isFresh('W48N45'), freshCartographer.isFresh('W48N45'));
    assert.equal(intelService.isFresh('W49N45'), false);
});