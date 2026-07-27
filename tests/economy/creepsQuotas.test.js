'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../mocks/screeps'); // injects RESOURCE_ENERGY and other Screeps globals
const quotas = require('../../src/economy/creepsQuotas');

function makeStorage(energy, capacity) {
    const store = {};
    store[RESOURCE_ENERGY] = energy;
    store.getCapacity = function () { return capacity; };
    return { store: store };
}

// --- quotasFor (base table) ---

test('quotasFor returns the base quota table for each RCL 0-8', function () {
    assert.deepEqual(quotas.quotasFor(0), {});
    assert.deepEqual(quotas.quotasFor(1), { harvester: 3, upgrader: 1 });
    assert.deepEqual(quotas.quotasFor(2), { harvester: 5, upgrader: 2 });
    assert.deepEqual(quotas.quotasFor(3), { miner: 2, hauler: 4, upgrader: 4, builder: 1 });
    assert.deepEqual(quotas.quotasFor(4), { miner: 6, hauler: 3, upgrader: 3, builder: 2 });
    assert.deepEqual(quotas.quotasFor(8), { miner: 8, hauler: 8, upgrader: 3, builder: 2 });
});

test('quotasFor unknown RCL returns the empty RCL 0 table', function () {
    assert.deepEqual(quotas.quotasFor(99), {});
});

// --- RCL 2 -> 3 transition ---

test('RCL 2 has harvesters but no miners/haulers/builders', function () {
    const q = quotas.quotasFor(2);
    assert.equal(q.harvester, 5);
    assert.equal(q.upgrader, 2);
    assert.equal(q.miner, undefined);
    assert.equal(q.hauler, undefined);
    assert.equal(q.builder, undefined);
});

test('RCL 3 switches to miners+haulers and drops harvesters', function () {
    const q = quotas.quotasFor(3);
    assert.equal(q.miner, 2);
    assert.equal(q.hauler, 4);
    assert.equal(q.upgrader, 4);
    assert.equal(q.builder, 1);
    assert.equal(q.harvester, undefined);
});

// --- dynamicQuota TTD branches ---

test('dynamicQuota with no controller returns the base table', function () {
    assert.deepEqual(quotas.dynamicQuota(3, null), quotas.quotasFor(3));
    assert.deepEqual(quotas.dynamicQuota(3, undefined), quotas.quotasFor(3));
});

test('dynamicQuota with healthy ticksToDowngrade returns the base table', function () {
    const q = quotas.dynamicQuota(2, { ticksToDowngrade: 20000 });
    assert.deepEqual(q, { harvester: 5, upgrader: 2 });
});

test('dynamicQuota WARN (<6000) adds one upgrader', function () {
    const q = quotas.dynamicQuota(2, { ticksToDowngrade: 5500 });
    assert.equal(q.upgrader, 3);
});

test('dynamicQuota CRITICAL (<4000) boosts upgrader to the cap', function () {
    // RCL 2: base upgrader 2, total 7, maxUpgraders 3 → min(3,3)=3
    const q = quotas.dynamicQuota(2, { ticksToDowngrade: 3500 });
    assert.equal(q.upgrader, 3);
});

test('dynamicQuota URGENT (<1000) boosts upgrader and ensures hauler>=1', function () {
    // RCL 2: base upgrader 2, total 7, maxUpgraders 3 → min(4,3)=3, max(2,3)=3
    // hauler gets max(0,1)=1 even though RCL 2 base has no hauler
    const q = quotas.dynamicQuota(2, { ticksToDowngrade: 500 });
    assert.equal(q.upgrader, 3);
    assert.equal(q.hauler, 1);
});

test('dynamicQuota URGENT at RCL 4 boosts upgrader to 4', function () {
    // RCL 4: base upgrader 3, total 14, maxUpgraders 7 → min(4,7)=4, max(3,4)=4
    const q = quotas.dynamicQuota(4, { ticksToDowngrade: 500 });
    assert.equal(q.upgrader, 4);
});

// --- contextualQuota storage branches ---

test('contextualQuota with null storage returns the base (pre-RCL 4 safe)', function () {
    const q = quotas.contextualQuota(3, { ticksToDowngrade: 20000 }, null, []);
    assert.deepEqual(q, quotas.quotasFor(3));
});

test('contextualQuota with full storage (ratio>=0.8) adds 2 upgraders capped at 6', function () {
    const storage = makeStorage(9000, 10000); // ratio 0.9
    const q = quotas.contextualQuota(3, { ticksToDowngrade: 20000 }, storage, []);
    assert.equal(q.upgrader, 6); // base 4 + 2 = 6, capped at 6
});

test('contextualQuota with low storage (ratio<=0.2) halves upgraders unless urgent', function () {
    const storage = makeStorage(1000, 10000); // ratio 0.1
    const q = quotas.contextualQuota(3, { ticksToDowngrade: 20000 }, storage, []);
    assert.equal(q.upgrader, 2); // max(1, floor(4/2)) = max(1,2) = 2
});

test('contextualQuota with low storage but urgent keeps upgraders', function () {
    const storage = makeStorage(1000, 10000); // ratio 0.1
    const q = quotas.contextualQuota(3, { ticksToDowngrade: 500 }, storage, []);
    // Urgent path already set upgrader; the low-storage halve is skipped when urgent
    assert.equal(q.upgrader, 4); // URGENT at RCL 3: max(4, min(4, floor(11/2)=5)) = 4
});

test('contextualQuota with mid storage leaves upgraders unchanged', function () {
    const storage = makeStorage(5000, 10000); // ratio 0.5
    const q = quotas.contextualQuota(3, { ticksToDowngrade: 20000 }, storage, []);
    assert.equal(q.upgrader, 4); // base RCL 3
});

// --- contextualQuota construction backlog ---

test('contextualQuota with large construction backlog adds builders capped at 5', function () {
    // RCL 3 base builder 1; backlog 6000 > 5000 → min(5, 1+2)=3
    const sites = [{ progress: 0, progressTotal: 6000 }];
    const q = quotas.contextualQuota(3, { ticksToDowngrade: 20000 }, null, sites);
    assert.equal(q.builder, 3);
});

test('contextualQuota with small backlog leaves builders unchanged', function () {
    const sites = [{ progress: 0, progressTotal: 3000 }];
    const q = quotas.contextualQuota(3, { ticksToDowngrade: 20000 }, null, sites);
    assert.equal(q.builder, 1); // base RCL 3
});

test('contextualQuota with empty sites array leaves builders unchanged', function () {
    const q = quotas.contextualQuota(3, { ticksToDowngrade: 20000 }, null, []);
    assert.equal(q.builder, 1);
});

// --- nextRoleToSpawn ---

test('nextRoleToSpawn at RCL 3 with empty counts returns miner (first in priority)', function () {
    const role = quotas.nextRoleToSpawn({}, 3, { ticksToDowngrade: 20000 }, null, []);
    assert.equal(role, 'miner');
});

test('nextRoleToSpawn at RCL 3 with miners satisfied returns hauler', function () {
    const role = quotas.nextRoleToSpawn({ miner: 2 }, 3, { ticksToDowngrade: 20000 }, null, []);
    assert.equal(role, 'hauler');
});

test('nextRoleToSpawn at RCL 2 with empty counts returns harvester', function () {
    const role = quotas.nextRoleToSpawn({}, 2, { ticksToDowngrade: 20000 }, null, []);
    assert.equal(role, 'harvester');
});

test('nextRoleToSpawn returns null when all quotas are met', function () {
    const counts = { miner: 2, hauler: 4, upgrader: 4, builder: 1 };
    const role = quotas.nextRoleToSpawn(counts, 3, { ticksToDowngrade: 20000 }, null, []);
    assert.equal(role, null);
});

test('nextRoleToSpawn without a controller uses the base quota', function () {
    const role = quotas.nextRoleToSpawn({}, 3, null, null, []);
    assert.equal(role, 'miner');
});

// --- spawnPriority ---

test('spawnPriority returns the ROLE_PRIORITY index for each role', function () {
    assert.equal(quotas.spawnPriority('fighter'), 0);
    assert.equal(quotas.spawnPriority('healer'), 1);
    assert.equal(quotas.spawnPriority('miner'), 2);
    assert.equal(quotas.spawnPriority('hauler'), 3);
    assert.equal(quotas.spawnPriority('harvester'), 4);
    assert.equal(quotas.spawnPriority('builder'), 5);
    assert.equal(quotas.spawnPriority('upgrader'), 6);
});

test('spawnPriority returns 999 for an unknown role', function () {
    assert.equal(quotas.spawnPriority('unknownRole'), 999);
});