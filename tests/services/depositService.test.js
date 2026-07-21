'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../mocks/screeps');
const depositService = require('../../src/services/depositService');

function pos(x, y) {
    return { x: x, y: y, roomName: 'W1N1' };
}

test('structureNeedsEnergy is true when below capacity', function () {
    const full = mocks.mockStructure(STRUCTURE_SPAWN, { energy: 300, capacity: 300 });
    const hungry = mocks.mockStructure(STRUCTURE_SPAWN, { energy: 100, capacity: 300 });
    assert.equal(depositService.structureNeedsEnergy(full), false);
    assert.equal(depositService.structureNeedsEnergy(hungry), true);
});

test('findDeposit prioritizes spawn over extension over storage', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 100, store: { [RESOURCE_ENERGY]: 100 } });
    const spawn = mocks.mockStructure(STRUCTURE_SPAWN, { id: 'spawn', pos: pos(26, 25), energy: 100, capacity: 300 });
    const extension = mocks.mockStructure(STRUCTURE_EXTENSION, { id: 'ext', pos: pos(27, 25), energy: 0, capacity: 50 });
    const storage = mocks.mockStructure(STRUCTURE_STORAGE, { id: 'storage', pos: pos(28, 25), energy: 4900, capacity: 5000 });
    const snapshot = { energyStructures: [spawn, extension], storage: storage, containers: [] };
    const chosen = depositService.findDeposit(creep, snapshot, {});
    assert.equal(chosen, spawn);
});

test('findDeposit respects excludeTypes', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 100, store: { [RESOURCE_ENERGY]: 100 } });
    const spawn = mocks.mockStructure(STRUCTURE_SPAWN, { id: 'spawn', pos: pos(26, 25), energy: 100, capacity: 300 });
    const extension = mocks.mockStructure(STRUCTURE_EXTENSION, { id: 'ext', pos: pos(27, 25), energy: 0, capacity: 50 });
    const snapshot = { energyStructures: [spawn, extension], storage: null, containers: [] };
    const chosen = depositService.findDeposit(creep, snapshot, { excludeTypes: { [STRUCTURE_SPAWN]: true } });
    assert.equal(chosen, extension);
});

test('findDeposit includes containers when energy structures are full', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 100, store: { [RESOURCE_ENERGY]: 100 } });
    const fullSpawn = mocks.mockStructure(STRUCTURE_SPAWN, { id: 'spawn', pos: pos(26, 25), energy: 300, capacity: 300 });
    const container = mocks.mockStructure(STRUCTURE_CONTAINER, { id: 'cont', pos: pos(27, 25), energy: 0, capacity: 1000 });
    const snapshot = { energyStructures: [fullSpawn], storage: null, containers: [container] };
    const chosen = depositService.findDeposit(creep, snapshot, {});
    assert.equal(chosen, container);
});

test('findDeposit returns storage for non-energy resources', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 100, store: { [RESOURCE_UTRIUM]: 50 } });
    const storage = mocks.mockStructure(STRUCTURE_STORAGE, { id: 'storage', pos: pos(28, 25), energy: 0, capacity: 5000 });
    storage.store.getFreeCapacity = function () { return 1000; };
    const snapshot = { energyStructures: [], storage: storage, containers: [] };
    const chosen = depositService.findDeposit(creep, snapshot, { resourceType: RESOURCE_UTRIUM });
    assert.equal(chosen, storage);
});

test('transferTo moves when out of range and returns true while carrying energy', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 100, store: { [RESOURCE_ENERGY]: 100 } });
    creep.transfer = function (_target, _rtype) { return ERR_NOT_IN_RANGE; };
    const target = mocks.mockStructure(STRUCTURE_SPAWN, { pos: pos(40, 25), energy: 0, capacity: 300 });
    const result = depositService.transferTo(creep, target, RESOURCE_ENERGY);
    assert.equal(result, true);
});
