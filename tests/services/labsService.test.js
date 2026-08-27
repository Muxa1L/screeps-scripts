// Tests for labsService. RCL5 path: all helpers return null/false safely.

const test = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../mocks/screeps.js');

test('labsService.getReactionProduct returns null without global REACTIONS', function () {
    // Wipe the cached global that the server normally provides so the
    // lazy-load path runs.
    const prev = global.REACTIONS;
    delete global.REACTIONS;
    try {
        delete require.cache[require.resolve('../../src/services/labsService.js')];
        const ls = require('../../src/services/labsService.js');
        assert.equal(ls.getReactionProduct('H', 'O'), null);
    } finally {
        if (prev !== undefined) global.REACTIONS = prev;
    }
});

test('labsService.findAllLabs returns empty array on RCL5', function () {
    mocks.resetGame();
    const ls = require('../../src/services/labsService.js');
    assert.deepEqual(ls.findAllLabs('W47N45'), []);
});

test('labsService.findLab returns null when the room has no labs', function () {
    mocks.resetGame();
    const ls = require('../../src/services/labsService.js');
    assert.equal(ls.findLab('W47N45', 'lab1'), null);
});

test('labsService.canRunReaction returns false without a live output lab', function () {
    mocks.resetGame();
    const ls = require('../../src/services/labsService.js');
    assert.equal(ls.canRunReaction('nonexistent', null, null, 'H', 'O', 5), false);
});

test('labsService.reactionCooldown returns 0 for unknown lab id', function () {
    mocks.resetGame();
    const ls = require('../../src/services/labsService.js');
    assert.equal(ls.reactionCooldown('nonexistent'), 0);
});
