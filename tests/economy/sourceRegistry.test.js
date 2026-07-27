'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../mocks/screeps');
const sourceRegistry = require('../../src/economy/sourceRegistry');

function makeRoom(name, sources) {
    return {
        name: name,
        find: function (type) {
            if (type === FIND_SOURCES) return sources;
            return [];
        },
    };
}

// --- ensureRegistry ---

test('ensureRegistry registers each source into Memory.sources with slots', function () {
    mocks.resetGame();
    mocks.resetMemory();
    // Source at (10,10); tiles around it are plain (non-wall) by default.
    const src = mocks.mockSource({ id: 'src1', pos: { x: 10, y: 10, roomName: 'W1N1' } });
    const room = makeRoom('W1N1', [src]);
    sourceRegistry.ensureRegistry(room);
    assert.ok(Memory.sources.src1, 'src1 should be registered');
    assert.equal(Memory.sources.src1.roomName, 'W1N1');
    assert.equal(Memory.sources.src1.x, 10);
    assert.equal(Memory.sources.src1.y, 10);
    // Slots: the 8 tiles around (10,10) excluding walls. Default terrain is
    // 'plain' so all 8 adjacent tiles become slots (none are off-map).
    assert.equal(Memory.sources.src1.slots.length, 8);
    for (let i = 0; i < Memory.sources.src1.slots.length; i++) {
        assert.equal(Memory.sources.src1.slots[i].claimedBy, null);
    }
});

test('ensureRegistry excludes wall tiles from slots', function () {
    mocks.resetGame();
    mocks.resetMemory();
    // Block the tile east of the source (11,10) with a wall.
    global._terrainMap['W1N1'] = { '11,10': 'wall' };
    const src = mocks.mockSource({ id: 'src1', pos: { x: 10, y: 10, roomName: 'W1N1' } });
    const room = makeRoom('W1N1', [src]);
    sourceRegistry.ensureRegistry(room);
    // 7 slots (8 minus the wall tile at 11,10)
    assert.equal(Memory.sources.src1.slots.length, 7);
    const hasEast = Memory.sources.src1.slots.some(function (s) {
        return s.x === 11 && s.y === 10;
    });
    assert.equal(hasEast, false, 'wall tile must not be a slot');
});

test('ensureRegistry is idempotent for an already-registered source', function () {
    mocks.resetGame();
    mocks.resetMemory();
    const src = mocks.mockSource({ id: 'src1', pos: { x: 10, y: 10, roomName: 'W1N1' } });
    const room = makeRoom('W1N1', [src]);
    sourceRegistry.ensureRegistry(room);
    const firstSlots = Memory.sources.src1.slots;
    // Second call on the same tick should not recompute (Game.time % 500 !== 0)
    // and should preserve the existing slot list.
    sourceRegistry.ensureRegistry(room);
    assert.equal(Memory.sources.src1.slots, firstSlots);
});

// --- freeSlot / claimSlot / releaseClaim ---

test('freeSlot returns an unclaimed slot and null when all claimed', function () {
    mocks.resetGame();
    mocks.resetMemory();
    const src = mocks.mockSource({ id: 'src1', pos: { x: 10, y: 10, roomName: 'W1N1' } });
    sourceRegistry.ensureRegistry(makeRoom('W1N1', [src]));
    const slot = sourceRegistry.freeSlot('src1');
    assert.ok(slot);
    // Claim all slots, then freeSlot should return null.
    const slots = Memory.sources.src1.slots;
    for (let i = 0; i < slots.length; i++) {
        slots[i].claimedBy = 'Creep' + i;
        Game.creeps['Creep' + i] = mocks.mockCreep({ name: 'Creep' + i });
    }
    assert.equal(sourceRegistry.freeSlot('src1'), null);
});

test('claimSlot marks a slot by creep name and is idempotent for the same creep', function () {
    mocks.resetGame();
    mocks.resetMemory();
    const src = mocks.mockSource({ id: 'src1', pos: { x: 10, y: 10, roomName: 'W1N1' } });
    sourceRegistry.ensureRegistry(makeRoom('W1N1', [src]));
    assert.ok(sourceRegistry.claimSlot('src1', 'Miner1'));
    assert.ok(sourceRegistry.claimSlot('src1', 'Miner1')); // idempotent
    const claimed = Memory.sources.src1.slots.filter(function (s) { return s.claimedBy === 'Miner1'; });
    assert.equal(claimed.length, 1, 'only one slot should be claimed by Miner1');
});

test('claimSlot returns false when every slot is already claimed', function () {
    mocks.resetGame();
    mocks.resetMemory();
    const src = mocks.mockSource({ id: 'src1', pos: { x: 10, y: 10, roomName: 'W1N1' } });
    sourceRegistry.ensureRegistry(makeRoom('W1N1', [src]));
    const slots = Memory.sources.src1.slots;
    for (let i = 0; i < slots.length; i++) {
        slots[i].claimedBy = 'Creep' + i;
        Game.creeps['Creep' + i] = mocks.mockCreep({ name: 'Creep' + i });
    }
    assert.equal(sourceRegistry.claimSlot('src1', 'NewMiner'), false);
});

test('claimSlot returns false for an unknown source id', function () {
    mocks.resetGame();
    mocks.resetMemory();
    Memory.sources = {};
    assert.equal(sourceRegistry.claimSlot('nope', 'Miner1'), false);
});

test('releaseClaim clears claimedBy across all sources for that creep', function () {
    mocks.resetGame();
    mocks.resetMemory();
    const srcA = mocks.mockSource({ id: 'srcA', pos: { x: 10, y: 10, roomName: 'W1N1' } });
    const srcB = mocks.mockSource({ id: 'srcB', pos: { x: 40, y: 40, roomName: 'W1N1' } });
    sourceRegistry.ensureRegistry(makeRoom('W1N1', [srcA, srcB]));
    sourceRegistry.claimSlot('srcA', 'Miner1');
    sourceRegistry.claimSlot('srcB', 'Miner1');
    sourceRegistry.releaseClaim('Miner1');
    const aClaimed = Memory.sources.srcA.slots.some(function (s) { return s.claimedBy === 'Miner1'; });
    const bClaimed = Memory.sources.srcB.slots.some(function (s) { return s.claimedBy === 'Miner1'; });
    assert.equal(aClaimed, false);
    assert.equal(bClaimed, false);
});

// --- countClaims ---

test('countClaims counts live-creep claims and ignores dead creeps', function () {
    mocks.resetGame();
    mocks.resetMemory();
    const src = mocks.mockSource({ id: 'src1', pos: { x: 10, y: 10, roomName: 'W1N1' } });
    sourceRegistry.ensureRegistry(makeRoom('W1N1', [src]));
    // Register LiveMiner before claiming so its slot isn't reclaimed by DeadMiner.
    Game.creeps['LiveMiner'] = mocks.mockCreep({ name: 'LiveMiner' });
    sourceRegistry.claimSlot('src1', 'LiveMiner');
    sourceRegistry.claimSlot('src1', 'DeadMiner'); // DeadMiner not in Game.creeps
    assert.equal(sourceRegistry.countClaims('src1'), 1);
});

test('countClaims returns 0 for an unknown source id', function () {
    mocks.resetGame();
    mocks.resetMemory();
    assert.equal(sourceRegistry.countClaims('nope'), 0);
});

// --- cleanupDeadClaims (via ensureRegistry) ---

test('ensureRegistry clears claimedBy for dead creeps on an already-registered source', function () {
    mocks.resetGame();
    mocks.resetMemory();
    const src = mocks.mockSource({ id: 'src1', pos: { x: 10, y: 10, roomName: 'W1N1' } });
    sourceRegistry.ensureRegistry(makeRoom('W1N1', [src]));
    sourceRegistry.claimSlot('src1', 'DoomedMiner');
    // DoomedMiner is not in Game.creeps → dead. Re-running ensureRegistry
    // (not on a 500-tick boundary) should clear the dead claim.
    sourceRegistry.ensureRegistry(makeRoom('W1N1', [src]));
    const claimed = Memory.sources.src1.slots.some(function (s) { return s.claimedBy === 'DoomedMiner'; });
    assert.equal(claimed, false);
});

// --- recomputeSlots (via the Game.time % 500 === 0 path) ---

test('recomputeSlots preserves live claims when refreshing the slot list', function () {
    mocks.resetGame();
    mocks.resetMemory();
    const src = mocks.mockSource({ id: 'src1', pos: { x: 10, y: 10, roomName: 'W1N1' } });
    sourceRegistry.ensureRegistry(makeRoom('W1N1', [src]));
    sourceRegistry.claimSlot('src1', 'LiveMiner');
    Game.creeps['LiveMiner'] = mocks.mockCreep({ name: 'LiveMiner' });
    // Bump Game.time to a multiple of 500 to trigger recomputeSlots.
    Game.time = 500;
    sourceRegistry.ensureRegistry(makeRoom('W1N1', [src]));
    const liveClaim = Memory.sources.src1.slots.some(function (s) { return s.claimedBy === 'LiveMiner'; });
    assert.ok(liveClaim, 'live claim must survive a slot recompute');
    assert.equal(Memory.sources.src1.slots.length, 8);
});

// --- slotPos ---

test('slotPos returns the RoomPosition for the slot claimed by the creep', function () {
    mocks.resetGame();
    mocks.resetMemory();
    const src = mocks.mockSource({ id: 'src1', pos: { x: 10, y: 10, roomName: 'W1N1' } });
    sourceRegistry.ensureRegistry(makeRoom('W1N1', [src]));
    sourceRegistry.claimSlot('src1', 'Miner1');
    const pos = sourceRegistry.slotPos('src1', 'Miner1');
    assert.ok(pos);
    assert.equal(pos.roomName, 'W1N1');
    // The slot must be one of the 8 tiles around (10,10).
    const dx = Math.abs(pos.x - 10);
    const dy = Math.abs(pos.y - 10);
    assert.ok(dx <= 1 && dy <= 1 && (dx + dy) > 0);
});

test('slotPos returns null for a creep with no claimed slot', function () {
    mocks.resetGame();
    mocks.resetMemory();
    const src = mocks.mockSource({ id: 'src1', pos: { x: 10, y: 10, roomName: 'W1N1' } });
    sourceRegistry.ensureRegistry(makeRoom('W1N1', [src]));
    assert.equal(sourceRegistry.slotPos('src1', 'Nobody'), null);
    assert.equal(sourceRegistry.slotPos('nope', 'Miner1'), null);
});