'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../mocks/screeps');
const memory = require('../../src/utils/memorySchema');
const energyService = require('../../src/services/energyService');

function pos(x, y) {
    return { x: x, y: y, roomName: 'W1N1' };
}

test('scoreSource rewards useful energy, reserve capacity, and penalizes distance', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 50, store: {} });
    const nearLow = mocks.mockStructure(STRUCTURE_CONTAINER, { id: 'nearLow', pos: pos(26, 25), energy: 30, capacity: 300 });
    const farHigh = mocks.mockStructure(STRUCTURE_CONTAINER, { id: 'farHigh', pos: pos(40, 25), energy: 1000, capacity: 2000 });
    const nearScore = energyService.scoreSource(creep, nearLow);
    const farScore = energyService.scoreSource(creep, farHigh);
    assert.ok(nearScore > 0);
    assert.ok(farScore > 0);
    assert.ok(nearScore > farScore);
});

test('findEnergySource prefers storage over dropped energy over containers', function () {
    mocks.resetMemory();
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 100, store: {} });
    const snapshot = {
        storage: mocks.mockStructure(STRUCTURE_STORAGE, { pos: pos(26, 25), energy: 1000, capacity: 5000 }),
        containers: [
            mocks.mockStructure(STRUCTURE_CONTAINER, { pos: pos(30, 25), energy: 300, capacity: 1000 }),
        ],
        droppedEnergy: [mocks.mockDroppedResource(100, pos(40, 25))],
        sources: [],
    };
    const chosen = energyService.findEnergySource(creep, snapshot, { allowHarvest: false });
    assert.equal(chosen, snapshot.storage);
});

test('findEnergySource prefers dropped energy over containers when storage absent', function () {
    mocks.resetMemory();
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 100, store: {} });
    const container = mocks.mockStructure(STRUCTURE_CONTAINER, { pos: pos(26, 25), energy: 300, capacity: 1000 });
    const dropped = mocks.mockDroppedResource(100, pos(27, 25));
    const snapshot = {
        containers: [container],
        droppedEnergy: [dropped],
        sources: [],
    };
    const chosen = energyService.findEnergySource(creep, snapshot, { allowHarvest: false });
    assert.equal(chosen, dropped);
});

test('findEnergySource prefers flagged priority containers over regular containers', function () {
    mocks.resetMemory();
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 100, store: {} });
    const regular = mocks.mockStructure(STRUCTURE_CONTAINER, { id: 'regular', pos: pos(40, 25), energy: 300, capacity: 1000 });
    const priority = mocks.mockStructure(STRUCTURE_CONTAINER, { id: 'priority', pos: pos(27, 25), energy: 50, capacity: 1000 });
    Game.flags['haul:controller-cache'] = mocks.mockFlag('haul:controller-cache', priority.pos, [priority]);
    const snapshot = {
        containers: [regular, priority],
        droppedEnergy: [],
        sources: [],
    };
    const chosen = energyService.findEnergySource(creep, snapshot, { allowHarvest: false });
    assert.equal(chosen, priority);
});

test('findEnergySource prefers flagged priority containers over dropped energy for non-haulers', function () {
    mocks.resetMemory();
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 100, store: {} });
    const priority = mocks.mockStructure(STRUCTURE_CONTAINER, { id: 'priority', pos: pos(26, 25), energy: 200, capacity: 2000 });
    const dropped = mocks.mockDroppedResource(200, pos(27, 25));
    Game.flags['haul:controller-cache'] = mocks.mockFlag('haul:controller-cache', priority.pos, [priority]);
    const snapshot = {
        containers: [priority],
        droppedEnergy: [dropped],
        sources: [],
    };
    const chosen = energyService.findEnergySource(creep, snapshot, { allowHarvest: false });
    assert.equal(chosen, priority);
});

test('findEnergySource excludes a specific container', function () {
    mocks.resetMemory();
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 100, store: {} });
    const a = mocks.mockStructure(STRUCTURE_CONTAINER, { id: 'cA', pos: pos(26, 25), energy: 300, capacity: 1000 });
    const b = mocks.mockStructure(STRUCTURE_CONTAINER, { id: 'cB', pos: pos(27, 25), energy: 300, capacity: 1000 });
    const snapshot = { containers: [a, b], droppedEnergy: [], sources: [] };
    const chosen = energyService.findEnergySource(creep, snapshot, { excludeContainerId: 'cA' });
    assert.equal(chosen, b);
});

test('findEnergySource falls back to harvesting only when allowed and not already hauling from storage', function () {
    mocks.resetMemory();
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 100, store: {} });
    const source = mocks.mockSource({ pos: pos(35, 25) });
    const snapshot = { containers: [], droppedEnergy: [], sources: [source] };
    let chosen = energyService.findEnergySource(creep, snapshot, { allowHarvest: false });
    assert.equal(chosen, null);
    chosen = energyService.findEnergySource(creep, snapshot, { allowHarvest: true });
    assert.equal(chosen, source);
});

test('findEnergySource sends harvesters to sources regardless of other sources', function () {
    mocks.resetMemory();
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 100, store: {}, memory: {} });
    memory.setRole(creep, 'harvester');
    const source = mocks.mockSource({ pos: pos(26, 25) });
    const storage = mocks.mockStructure(STRUCTURE_STORAGE, { pos: pos(27, 25), energy: 1000, capacity: 5000 });
    const snapshot = { storage: storage, containers: [], droppedEnergy: [], sources: [source] };
    const chosen = energyService.findEnergySource(creep, snapshot, {});
    assert.equal(chosen, source);
});

// --- link withdraw (RCL 5 link network activation) ---

test('findEnergySource prefers the controller link over a container for an upgrader near the controller', function () {
    mocks.resetMemory();
    mocks.resetGame();
    const controller = { pos: pos(20, 20) };
    const creep = mocks.mockCreep({ pos: pos(21, 20), capacity: 100, store: {} });
    const controllerLink = mocks.mockStructure(STRUCTURE_LINK, { id: 'clink', pos: pos(20, 21), energy: 500, capacity: 800 });
    const farContainer = mocks.mockStructure(STRUCTURE_CONTAINER, { id: 'cont', pos: pos(40, 40), energy: 1000, capacity: 2000 });
    const snapshot = {
        containers: [farContainer],
        links: [controllerLink],
        droppedEnergy: [],
        sources: [],
    };
    const chosen = energyService.findEnergySource(creep, snapshot, { anchor: controller, allowHarvest: false });
    assert.equal(chosen, controllerLink);
});

test('findEnergySource drains a storage link when storage is absent', function () {
    mocks.resetMemory();
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 100, store: {} });
    const storageLink = mocks.mockStructure(STRUCTURE_LINK, { id: 'slink', pos: pos(26, 25), energy: 600, capacity: 800 });
    const snapshot = {
        storage: null,
        containers: [],
        links: [storageLink],
        droppedEnergy: [],
        sources: [],
    };
    const chosen = energyService.findEnergySource(creep, snapshot, { allowHarvest: false });
    assert.equal(chosen, storageLink);
});

test('findEnergySource sticky-locks onto a link across ticks', function () {
    mocks.resetMemory();
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 100, store: {} });
    const link = mocks.mockStructure(STRUCTURE_LINK, { id: 'slink', pos: pos(26, 25), energy: 500, capacity: 800 });
    memory.setRefuelSource(creep, 'slink');
    const snapshot = {
        storage: null,
        containers: [],
        links: [link],
        droppedEnergy: [],
        sources: [],
    };
    const chosen = energyService.findEnergySource(creep, snapshot, { allowHarvest: false });
    assert.equal(chosen, link);
});

test('findEnergySource skips a link below LINK_WITHDRAW_MIN', function () {
    mocks.resetMemory();
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 100, store: {} });
    const lowLink = mocks.mockStructure(STRUCTURE_LINK, { id: 'lowlink', pos: pos(26, 25), energy: 49, capacity: 800 });
    const snapshot = {
        storage: null,
        containers: [],
        links: [lowLink],
        droppedEnergy: [],
        sources: [],
    };
    const chosen = energyService.findEnergySource(creep, snapshot, { allowHarvest: false });
    assert.equal(chosen, null);
});
