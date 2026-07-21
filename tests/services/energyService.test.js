'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../mocks/screeps');
const memory = require('../../src/utils/memorySchema');
const energyService = require('../../src/services/energyService');

function pos(x, y) {
    return { x: x, y: y, roomName: 'W1N1' };
}

test('scoreSource rewards useful energy and penalizes distance', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 50, store: {} });
    const nearLow = { store: { [RESOURCE_ENERGY]: 30 }, pos: pos(26, 25) };
    const farHigh = { store: { [RESOURCE_ENERGY]: 1000 }, pos: pos(40, 25) };
    const nearScore = energyService.scoreSource(creep, nearLow);
    const farScore = energyService.scoreSource(creep, farHigh);
    assert.equal(nearScore, 30);
    assert.equal(farScore, 50 / 15);
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
