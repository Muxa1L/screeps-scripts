'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../../mocks/screeps');
const memory = require('../../../src/utils/memorySchema');
const roomManager = require('../../../src/managers/roomManager');
const safeModeService = require('../../../src/managers/upkeep/safeModeService');

function pos(x, y) {
    return { x: x, y: y, roomName: 'W1N1' };
}

function makeRoomWithSpawn(name, opts) {
    opts = opts || {};
    const spawn = mocks.mockStructure(STRUCTURE_SPAWN, {
        id: 'spawn1',
        pos: pos(25, 25),
        hits: opts.spawnHits !== undefined ? opts.spawnHits : 10000,
        hitsMax: 10000,
    });
    spawn.structureType = STRUCTURE_SPAWN;
    spawn.room = { name: name };
    const room = {
        name: name,
        controller: opts.controller || {
            my: true,
            level: 4,
            ticksToDowngrade: opts.ttd || 20000,
            safeModeAvailable: opts.safeModeAvailable !== undefined ? opts.safeModeAvailable : 1,
            safeMode: opts.safeMode || 0,
            safeModeCooldown: opts.safeModeCooldown || 0,
            activateSafeMode: opts.activateSafeMode || function () { return OK; },
        },
        find: function (type) {
            if (type === FIND_HOSTILE_CREEPS) return opts.hostiles || [];
            if (type === FIND_MY_CREEPS) return [];
            if (type === FIND_STRUCTURES) return [spawn];
            return [];
        },
    };
    Game.rooms[name] = room;
    Game.spawns = { 'Spawn1': spawn };
    return { room: room, spawn: spawn };
}

test('runSafeMode does nothing when no hostiles are present', function () {
    mocks.resetGame();
    makeRoomWithSpawn('W1N1', { hostiles: [], spawnHits: 1000 });
    roomManager.tick();
    let activated = false;
    const room = Game.rooms['W1N1'];
    room.controller.activateSafeMode = function () { activated = true; return OK; };
    safeModeService.runSafeMode();
    assert.equal(activated, false);
});

test('runSafeMode activates when spawn below threshold and hostiles present', function () {
    mocks.resetGame();
    mocks.resetMemory();
    Game.time = 10000;
    makeRoomWithSpawn('W1N1', {
        hostiles: [mocks.mockCreep({ name: 'H1', pos: pos(10, 10), parts: {} })],
        spawnHits: 4000, // 40% < 50% threshold
    });
    roomManager.tick();
    let activated = false;
    const room = Game.rooms['W1N1'];
    room.controller.activateSafeMode = function () { activated = true; return OK; };
    safeModeService.runSafeMode();
    assert.equal(activated, true);
});

test('runSafeMode does not activate when spawn damaged but no hostiles', function () {
    mocks.resetGame();
    makeRoomWithSpawn('W1N1', { hostiles: [], spawnHits: 1000 });
    roomManager.tick();
    let activated = false;
    const room = Game.rooms['W1N1'];
    room.controller.activateSafeMode = function () { activated = true; return OK; };
    safeModeService.runSafeMode();
    assert.equal(activated, false);
});

test('runSafeMode activates on low TTD with hostiles', function () {
    mocks.resetGame();
    mocks.resetMemory();
    Game.time = 10000;
    const hostile = mocks.mockCreep({ name: 'H1', pos: pos(10, 10), parts: {} });
    hostile.hits = 100;
    makeRoomWithSpawn('W1N1', { hostiles: [hostile], ttd: 2000, spawnHits: 10000 });
    roomManager.tick();
    let activated = false;
    const room = Game.rooms['W1N1'];
    room.controller.activateSafeMode = function () { activated = true; return OK; };
    safeModeService.runSafeMode();
    assert.equal(activated, true);
});

test('runSafeMode does not activate when safeMode already active', function () {
    mocks.resetGame();
    const hostile = mocks.mockCreep({ name: 'H1', pos: pos(10, 10), parts: {} });
    hostile.hits = 100;
    makeRoomWithSpawn('W1N1', {
        hostiles: [hostile],
        spawnHits: 1000,
        safeMode: 1,
    });
    roomManager.tick();
    let activated = false;
    const room = Game.rooms['W1N1'];
    room.controller.activateSafeMode = function () { activated = true; return OK; };
    safeModeService.runSafeMode();
    assert.equal(activated, false);
});

test('runSafeMode does not activate when no safeModeAvailable', function () {
    mocks.resetGame();
    const hostile = mocks.mockCreep({ name: 'H1', pos: pos(10, 10), parts: {} });
    hostile.hits = 100;
    makeRoomWithSpawn('W1N1', {
        hostiles: [hostile],
        spawnHits: 1000,
        safeModeAvailable: 0,
    });
    roomManager.tick();
    let activated = false;
    const room = Game.rooms['W1N1'];
    room.controller.activateSafeMode = function () { activated = true; return OK; };
    safeModeService.runSafeMode();
    assert.equal(activated, false);
});

test('runSafeMode respects cooldown', function () {
    mocks.resetGame();
    const hostile = mocks.mockCreep({ name: 'H1', pos: pos(10, 10), parts: {} });
    hostile.hits = 100;
    makeRoomWithSpawn('W1N1', {
        hostiles: [hostile],
        spawnHits: 1000,
        safeModeCooldown: 1,
    });
    roomManager.tick();
    let activated = false;
    const room = Game.rooms['W1N1'];
    room.controller.activateSafeMode = function () { activated = true; return OK; };
    safeModeService.runSafeMode();
    assert.equal(activated, false);
});