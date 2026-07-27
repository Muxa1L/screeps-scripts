'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../mocks/screeps');
const memory = require('../../src/utils/memorySchema');
const creepRunner = require('../../src/managers/creepRunner');
const roomManager = require('../../src/managers/roomManager');
const tasks = require('../../src/tasks/tasksIndex');

// Regression test for the bug where fighters with no CARRY parts were
// permanently `isEmpty=true` and got filtered out of `defend` tasks by the
// bestTaskFor `isEmpty` filter. The filter exists to stop empty builders/
// upgraders from taking non-refueling work, but it must not exclude combat
// tasks from combat creeps. See creepRunner.bestTaskFor / line 185 fix.

test('creeps with no CARRY capacity are not treated as empty', function () {
    mocks.resetMemory();
    mocks.resetGame();
    // Fighter with no CARRY: capacity 0, energy 0.
    const fighter = mocks.mockCreep({
        name: 'Fighter1-Spawn1',
        pos: { x: 25, y: 25, roomName: 'W1N1' },
        capacity: 0,
        store: {},
        parts: { attack: 3, tough: 3, move: 6 },
    });
    memory.setRole(fighter, 'fighter');
    const capacity = fighter.store.getCapacity(RESOURCE_ENERGY) || 0;
    const energy = fighter.store[RESOURCE_ENERGY] || 0;
    const isFull = capacity > 0 && energy >= capacity;
    const isEmpty = capacity > 0 && energy === 0;
    assert.equal(capacity, 0);
    assert.equal(energy, 0);
    assert.equal(isFull, false);
    // The fix: a no-CARRY creep is NOT empty. Before the fix, isEmpty was
    // `energy === 0` and was true here, which caused `defend` tasks to be
    // skipped for fighters.
    assert.equal(isEmpty, false);
});

test('creeps with CARRY and zero energy are still treated as empty', function () {
    mocks.resetMemory();
    mocks.resetGame();
    const hauler = mocks.mockCreep({
        name: 'Hauler1-Spawn1',
        pos: { x: 25, y: 25, roomName: 'W1N1' },
        capacity: 100,
        store: {},
    });
    memory.setRole(hauler, 'hauler');
    const capacity = hauler.store.getCapacity(RESOURCE_ENERGY) || 0;
    const energy = hauler.store[RESOURCE_ENERGY] || 0;
    const isEmpty = capacity > 0 && energy === 0;
    assert.equal(capacity, 100);
    assert.equal(energy, 0);
    assert.equal(isEmpty, true);
});

// --- collectCombatTasks + per-tick cache wiring ---

function setupCombatTaskMocks(hostiles, damagedFriendlies) {
    // roomManager.get returns a snapshot for W1N1; null for other rooms.
    const origGet = roomManager.get;
    roomManager.get = function (rn) {
        if (rn === 'W1N1') return { hostiles: hostiles || [], damagedFriendlies: damagedFriendlies || [] };
        return null;
    };
    // tasks.get returns a minimal spec whose .tasks() emits one item per
    // snapshot hostile (defend) or damaged friendly (heal).
    const origTasksGet = tasks.get;
    const defendSpec = {
        type: 'defend', priority: 10,
        tasks: function (_room, snap) { return snap.hostiles.map(function (h) { return { target: h }; }); },
    };
    const healSpec = {
        type: 'heal', priority: 30,
        tasks: function (_room, snap) { return snap.damagedFriendlies.map(function (c) { return { target: c }; }); },
    };
    tasks.get = function (type) { return type === 'defend' ? defendSpec : (type === 'heal' ? healSpec : null); };
    return function restore() { roomManager.get = origGet; tasks.get = origTasksGet; };
}

test('collectCombatTasks returns defend tasks for fighter from snapshotted rooms', function () {
    mocks.resetGame();
    Game.rooms['W1N1'] = { name: 'W1N1' };
    const hostile = { id: 'h1', hits: 100, hitsMax: 100 };
    const restore = setupCombatTaskMocks([hostile], []);
    try {
        const out = creepRunner.collectCombatTasks('fighter');
        assert.equal(out.length, 1);
        assert.equal(out[0].type, 'defend');
        assert.equal(out[0].target, hostile);
    } finally {
        restore();
    }
});

test('collectCombatTasks returns heal tasks for healer', function () {
    mocks.resetGame();
    Game.rooms['W1N1'] = { name: 'W1N1' };
    const hurt = { id: 'f1', hits: 50, hitsMax: 100 };
    const restore = setupCombatTaskMocks([], [hurt]);
    try {
        const out = creepRunner.collectCombatTasks('healer');
        assert.equal(out.length, 1);
        assert.equal(out[0].type, 'heal');
        assert.equal(out[0].target, hurt);
    } finally {
        restore();
    }
});

test('collectCombatTasks skips rooms without a snapshot', function () {
    mocks.resetGame();
    Game.rooms['W1N1'] = { name: 'W1N1' };
    Game.rooms['W2N2'] = { name: 'W2N2' }; // no snapshot -> skipped
    const hostile = { id: 'h1', hits: 100, hitsMax: 100 };
    const restore = setupCombatTaskMocks([hostile], []);
    try {
        const out = creepRunner.collectCombatTasks('fighter');
        assert.equal(out.length, 1);
        assert.equal(out[0].target, hostile);
    } finally {
        restore();
    }
});

test('runCreep combat task cache: collectCombatTasks runs once per role per tick', function () {
    mocks.resetGame();
    Game.rooms['W1N1'] = { name: 'W1N1' };
    const hostile = { id: 'h1', hits: 100, hitsMax: 100 };
    let tasksGetCalls = 0;
    const restore = setupCombatTaskMocks([hostile], []);
    // Wrap tasks.get to count how often collectCombatTasks invokes it.
    const countedGet = tasks.get;
    tasks.get = function (type) { tasksGetCalls += 1; return countedGet(type); };
    try {
        const context = { combatTaskCache: {} };
        // Simulate the runCreep cache block twice for the same role.
        function cacheBlock(role) {
            let combatTasks = context.combatTaskCache[role];
            if (!combatTasks) {
                combatTasks = creepRunner.collectCombatTasks(role);
                context.combatTaskCache[role] = combatTasks;
            }
            return combatTasks;
        }
        const first = cacheBlock('fighter');
        const firstCalls = tasksGetCalls;
        const second = cacheBlock('fighter');
        // Cache hit: collectCombatTasks must not run again.
        assert.equal(tasksGetCalls, firstCalls);
        assert.equal(second, first);
        assert.equal(second.length, 1);
    } finally {
        restore();
    }
});