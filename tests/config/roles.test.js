'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const roles = require('../../src/config/roles');

test('allowedSet returns a { [taskType]: true } set for a restricted role', function () {
    const set = roles.allowedSet('miner');
    assert.equal(set.mine, true);
    assert.equal(set.haul, undefined);
});

test('allowedSet returns null for an unrestricted role', function () {
    assert.equal(roles.allowedSet('harvester'), null);
});

test('allowedSet returns null for an unknown role', function () {
    assert.equal(roles.allowedSet('nonexistent'), null);
});

test('allowedSet caches the result per role (identity stable across calls)', function () {
    const first = roles.allowedSet('hauler');
    const second = roles.allowedSet('hauler');
    assert.equal(first, second);
    // Sanity: the cached set has the expected keys. Hauler no longer takes
    // supply (recovery gating sends distributors instead).
    assert.equal(first.haul, true);
    assert.equal(first.sweep, true);
    assert.equal(first.supply, undefined);
});