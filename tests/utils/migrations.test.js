'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mock = require('../mocks/screeps');
const migrations = require('../../src/utils/migrations');

beforeEach(function () {
    mock.resetGame();
    mock.resetMemory();
});

test('runs all migrations on a fresh memory', function () {
    migrations.runMigrations();
    assert.equal(Memory.migrated, migrations.MIGRATIONS.length);
    for (let i = 0; i < migrations.MIGRATIONS.length; i++) {
        const v = migrations.MIGRATIONS[i].version;
        assert.ok(Memory.migrations.applied.includes(v), 'version ' + v + ' should be applied');
    }
});

test('does not re-run applied migrations', function () {
    migrations.runMigrations();
    // Set a sentinel that migration 1 would delete
    Memory.knownSources = { sentinel: 'foo' };
    Memory.migrations.applied.push(1); // already in the list, but double-safe
    migrations.runMigrations();
    // knownSources should still be there (migration 1 was skipped)
    assert.equal(Memory.knownSources.sentinel, 'foo');
});

test('handles a fresh restart with Memory.migrated already set high', function () {
    Memory.migrated = 999;
    migrations.runMigrations();
    assert.ok(Memory.migrated >= 999);
    // All migrations should be marked applied without running
    assert.equal(Memory.migrations.applied.length, migrations.MIGRATIONS.length);
});

test('records failures in Memory.migrations.failures', function () {
    // Inject a failing migration
    const original = migrations.MIGRATIONS.slice();
    migrations.MIGRATIONS.push({
        version: 9999,
        description: 'always fails',
        run: function () { throw new Error('test failure'); },
    });
    try {
        migrations.runMigrations();
        assert.ok(Memory.migrations.failures, 'failures array should exist');
        const f = Memory.migrations.failures.find(function (f) { return f.version === 9999; });
        assert.ok(f, 'failure for version 9999 should be recorded');
        assert.equal(f.error, 'test failure');
    } finally {
        // Restore original migrations array
        migrations.MIGRATIONS.length = 0;
        for (let i = 0; i < original.length; i++) migrations.MIGRATIONS.push(original[i]);
    }
});

test('idempotent: running twice does not wipe existing data', function () {
    migrations.runMigrations();
    Memory.intel.rooms['W1N1'] = { hostiles: 3 };
    Memory.squads['squad1'] = { leaderId: 'abc' };
    migrations.runMigrations();
    assert.equal(Memory.intel.rooms['W1N1'].hostiles, 3);
    assert.equal(Memory.squads['squad1'].leaderId, 'abc');
});

test('resetMigrations clears applied list down to target version', function () {
    migrations.runMigrations();
    assert.ok(Memory.migrations.applied.length > 0);
    migrations.resetMigrations(4);
    assert.equal(Memory.migrated, 3);
    // Versions 1-3 should be in applied, 4+ should not
    assert.ok(Memory.migrations.applied.includes(1));
    assert.ok(Memory.migrations.applied.includes(2));
    assert.ok(Memory.migrations.applied.includes(3));
    assert.ok(!Memory.migrations.applied.includes(4));
});

test('migration 1 deletes legacy caches', function () {
    Memory.knownSources = { 'src1': true };
    Memory.sourceToSource = { 'src1': 'src2' };
    Memory.pathCache = { 'W1N1': [] };
    migrations.runMigrations();
    assert.equal(Memory.knownSources, undefined);
    assert.equal(Memory.sourceToSource, undefined);
    assert.equal(Memory.pathCache, undefined);
});

test('migration 2 moves legacy intel entries into .rooms', function () {
    Memory.intel = { W1N1: { hostiles: 2 }, queue: [], scanCursor: 0, raids: {} };
    migrations.runMigrations();
    assert.ok(Memory.intel.rooms);
    assert.equal(Memory.intel.rooms['W1N1'].hostiles, 2);
    // Meta keys should still be at the top level
    assert.ok(Array.isArray(Memory.intel.queue));
});

test('migration 5 initializes feature flags with defaults', function () {
    migrations.runMigrations();
    assert.ok(Memory.flags);
    assert.equal(Memory.flags.squads, false);
    assert.equal(Memory.flags.intel, false);
    assert.equal(Memory.flags.remoteMining, false);
    assert.equal(Memory.flags.expansion, false);
});

test('migration 5 preserves existing flag values', function () {
    Memory.flags = { squads: true, remoteMining: true };
    migrations.runMigrations();
    assert.equal(Memory.flags.squads, true);
    assert.equal(Memory.flags.remoteMining, true);
    // Unset flags should get defaults
    assert.equal(Memory.flags.intel, false);
});

test('migration 6 back-fills homeRoom on creeps in owned rooms', function () {
    // Set up a mock room and creep
    mock.resetGame();
    Game.rooms['W1N1'] = { controller: { my: true }, name: 'W1N1' };
    Game.creeps['creep1'] = { memory: {}, pos: { roomName: 'W1N1' } };
    migrations.runMigrations();
    assert.equal(Game.creeps['creep1'].memory.homeRoom, 'W1N1');
});

test('migration 6 does not overwrite existing homeRoom', function () {
    mock.resetGame();
    Game.rooms['W1N1'] = { controller: { my: true }, name: 'W1N1' };
    Game.creeps['creep1'] = { memory: { homeRoom: 'W2N2' }, pos: { roomName: 'W1N1' } };
    migrations.runMigrations();
    assert.equal(Game.creeps['creep1'].memory.homeRoom, 'W2N2');
});