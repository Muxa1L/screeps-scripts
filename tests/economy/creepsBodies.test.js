'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../mocks/screeps'); // injects Screeps bodypart/structure globals
const bodies = require('../../src/economy/creepsBodies');

// --- bodyCost / bodyCostOfCreep ---

test('bodyCost sums PART_COST for each body part', function () {
    assert.equal(bodies.bodyCost([MOVE]), 50);
    assert.equal(bodies.bodyCost([WORK]), 100);
    assert.equal(bodies.bodyCost([CARRY]), 50);
    assert.equal(bodies.bodyCost([TOUGH]), 10);
    assert.equal(bodies.bodyCost([HEAL]), 200);
    assert.equal(bodies.bodyCost([CLAIM]), 600);
    assert.equal(bodies.bodyCost([WORK, CARRY, MOVE]), 100 + 50 + 50);
});

test('bestBodyForCapacity returns cost equal to bodyCost of the chosen body', function () {
    // The tier keys are capacity breakpoints, not always the body cost
    // (hauler bodies are cheaper than their keys). Verify internal
    // consistency: result.cost === bodyCost(result.body).
    const roles = Object.keys(bodies.BODIES);
    for (let i = 0; i < roles.length; i++) {
        const role = roles[i];
        const table = bodies.BODIES[role];
        const tierKeys = Object.keys(table).map(Number).sort(function (a, b) { return a - b; });
        for (let j = 0; j < tierKeys.length; j++) {
            const cap = tierKeys[j];
            const result = bodies.bestBodyForCapacity(role, cap);
            if (!result) continue;
            assert.equal(result.cost, bodies.bodyCost(result.body),
                role + ' at cap ' + cap + ': result.cost must equal bodyCost(body)');
        }
    }
});

test('bodyCostOfCreep handles creep.body objects ({type, ...})', function () {
    const creep = { body: [{ type: 'work' }, { type: 'carry' }, { type: 'move' }] };
    assert.equal(bodies.bodyCostOfCreep(creep), 100 + 50 + 50);
});

test('bodyCost returns 0 for an empty body', function () {
    assert.equal(bodies.bodyCost([]), 0);
});

// --- bestBodyForCapacity ---

test('bestBodyForCapacity returns the cheapest miner tier at 200', function () {
    const result = bodies.bestBodyForCapacity('miner', 200);
    assert.deepEqual(result.body, [WORK, CARRY, MOVE]);
    assert.equal(result.cost, 200);
    assert.equal(result.role, 'miner');
});

test('bestBodyForCapacity returns the 300-cost miner tier at 300', function () {
    const result = bodies.bestBodyForCapacity('miner', 300);
    assert.deepEqual(result.body, [WORK, WORK, CARRY, MOVE]);
    assert.equal(result.cost, 300);
});

test('bestBodyForCapacity returns the RCL 3 miner tier at 550 (4W+C+2M)', function () {
    // 550 is the RCL 3 spawn energy capacity (300 spawn + 5*50 extensions).
    const result = bodies.bestBodyForCapacity('miner', 550);
    assert.deepEqual(result.body, [WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE]);
    assert.equal(result.cost, 550);
});

test('bestBodyForCapacity returns the largest affordable tier', function () {
    // 800 picks the 800 tier over 550 when affordable
    const result = bodies.bestBodyForCapacity('miner', 800);
    assert.equal(result.cost, 800);
});

test('bestBodyForCapacity returns null when capacity is below the cheapest tier', function () {
    // Cheapest miner tier is 200; 150 can't afford it
    assert.equal(bodies.bestBodyForCapacity('miner', 150), null);
});

test('bestBodyForCapacity returns null for an unknown role', function () {
    assert.equal(bodies.bestBodyForCapacity('unknownRole', 10000), null);
});

test('bestBodyForCapacity for hauler at 550 returns the largest affordable body', function () {
    // Hauler tier keys are body costs: the 450-cost body [C*6, M*3] fits at
    // cap 550, and the 950-cost body does not. So the largest affordable
    // hauler at 550 is the 450-cost body.
    const result = bodies.bestBodyForCapacity('hauler', 550);
    assert.deepEqual(result.body, [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE]);
    assert.equal(result.cost, 450);
});

// --- bestBodyForAvailable ---

test('bestBodyForAvailable clamps to min(capacity, available)', function () {
    // cap 800, available 300 → picks the 300 tier, not 800
    const result = bodies.bestBodyForAvailable('miner', 800, 300);
    assert.equal(result.cost, 300);
});

test('bestBodyForAvailable with low available returns the affordable tier', function () {
    const result = bodies.bestBodyForAvailable('hauler', 800, 200);
    assert.equal(result.cost, 200);
});

test('bestBodyForAvailable returns null when available is below the cheapest tier', function () {
    assert.equal(bodies.bestBodyForAvailable('miner', 800, 100), null);
});

// --- bodySummary ---

test('bodySummary returns the tier cost keys per role', function () {
    const summary = bodies.bodySummary();
    assert.ok(summary.miner.indexOf(200) !== -1);
    assert.ok(summary.miner.indexOf(550) !== -1);
    assert.ok(summary.hauler.indexOf(400) !== -1);
    assert.ok(summary.fighter.indexOf(570) !== -1);
    assert.ok(summary.healer.indexOf(930) !== -1);
    assert.ok(summary.builder.indexOf(200) !== -1);
    assert.ok(summary.harvester.indexOf(200) !== -1);
    assert.ok(summary.upgrader.indexOf(200) !== -1);
});

// --- Fighter/healer no-CARRY regression guard (2026-07-27 never-attack bug) ---

test('every fighter body has zero CARRY parts', function () {
    const table = bodies.BODIES.fighter;
    const tiers = Object.keys(table);
    for (let i = 0; i < tiers.length; i++) {
        const body = table[tiers[i]];
        assert.equal(body.indexOf(CARRY), -1,
            'fighter tier ' + tiers[i] + ' must not contain CARRY');
    }
});

test('every healer body has zero CARRY parts', function () {
    const table = bodies.BODIES.healer;
    const tiers = Object.keys(table);
    for (let i = 0; i < tiers.length; i++) {
        const body = table[tiers[i]];
        assert.equal(body.indexOf(CARRY), -1,
            'healer tier ' + tiers[i] + ' must not contain CARRY');
    }
});

test('fighter and healer bodies contain only TOUGH, MOVE, and ATTACK/HEAL', function () {
    const allowed = {};
    allowed[TOUGH] = true;
    allowed[MOVE] = true;
    allowed[ATTACK] = true;
    allowed[HEAL] = true;
    ['fighter', 'healer'].forEach(function (role) {
        const table = bodies.BODIES[role];
        const tiers = Object.keys(table);
        for (let i = 0; i < tiers.length; i++) {
            const body = table[tiers[i]];
            for (let j = 0; j < body.length; j++) {
                assert.ok(allowed[body[j]],
                    role + ' tier ' + tiers[i] + ' has unexpected part ' + body[j]);
            }
        }
    });
});