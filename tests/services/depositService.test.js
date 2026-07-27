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

test('findDeposit prefers flagged priority containers over closer ordinary containers', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 100, store: { [RESOURCE_ENERGY]: 100 } });
    const near = mocks.mockStructure(STRUCTURE_CONTAINER, { id: 'near', pos: pos(26, 25), energy: 0, capacity: 1000 });
    const flagged = mocks.mockStructure(STRUCTURE_CONTAINER, { id: 'flagged', pos: pos(40, 25), energy: 0, capacity: 1000 });
    Game.flags['haul:controller-cache'] = mocks.mockFlag('haul:controller-cache', flagged.pos, [flagged]);
    const snapshot = { energyStructures: [], storage: null, containers: [near, flagged] };
    const chosen = depositService.findDeposit(creep, snapshot, {});
    assert.equal(chosen, flagged);
});

test('findDeposit fills storage before priority container (overflow buffer)', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 100, store: { [RESOURCE_ENERGY]: 100 } });
    const storage = mocks.mockStructure(STRUCTURE_STORAGE, { id: 'storage', pos: pos(26, 25), energy: 0, capacity: 5000 });
    const flagged = mocks.mockStructure(STRUCTURE_CONTAINER, { id: 'flagged', pos: pos(40, 25), energy: 0, capacity: 1000 });
    Game.flags['haul:cache'] = mocks.mockFlag('haul:cache', flagged.pos, [flagged]);
    const snapshot = { energyStructures: [], storage: storage, containers: [flagged] };
    const chosen = depositService.findDeposit(creep, snapshot, {});
    assert.equal(chosen, storage);
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

// --- source-link deposit (RCL 5 link network activation) ---

test('findDeposit fills a source link when spawns/extensions/storage/containers are full', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 100, store: { [RESOURCE_ENERGY]: 100 } });
    const fullSpawn = mocks.mockStructure(STRUCTURE_SPAWN, { id: 'spawn', pos: pos(26, 25), energy: 300, capacity: 300 });
    const fullContainer = mocks.mockStructure(STRUCTURE_CONTAINER, { id: 'cont', pos: pos(27, 25), energy: 1000, capacity: 1000 });
    const sourceLink = mocks.mockStructure(STRUCTURE_LINK, { id: 'slink', pos: pos(10, 10), energy: 0, capacity: 800 });
    const source = mocks.mockSource({ id: 'src1', pos: pos(11, 10) });
    const snapshot = { energyStructures: [fullSpawn], storage: null, containers: [fullContainer], links: [sourceLink], sources: [source] };
    const chosen = depositService.findDeposit(creep, snapshot, {});
    assert.equal(chosen, sourceLink);
});

test('findDeposit does not fill a controller link (only source links qualify)', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 100, store: { [RESOURCE_ENERGY]: 100 } });
    const controllerLink = mocks.mockStructure(STRUCTURE_LINK, { id: 'clink', pos: pos(20, 20), energy: 0, capacity: 800 });
    // No sources anywhere near the link → it's a controller link, not a source link.
    const source = mocks.mockSource({ id: 'src1', pos: pos(45, 45) });
    const snapshot = { energyStructures: [], storage: null, containers: [], links: [controllerLink], sources: [source] };
    const chosen = depositService.findDeposit(creep, snapshot, {});
    assert.equal(chosen, null);
});

test('findDeposit prefers a haul: container over a source link (regression guard)', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 100, store: { [RESOURCE_ENERGY]: 100 } });
    const flagged = mocks.mockStructure(STRUCTURE_CONTAINER, { id: 'flagged', pos: pos(40, 25), energy: 0, capacity: 1000 });
    Game.flags['haul:cache'] = mocks.mockFlag('haul:cache', flagged.pos, [flagged]);
    const sourceLink = mocks.mockStructure(STRUCTURE_LINK, { id: 'slink', pos: pos(10, 10), energy: 0, capacity: 800 });
    const source = mocks.mockSource({ id: 'src1', pos: pos(11, 10) });
    const snapshot = { energyStructures: [], storage: null, containers: [flagged], links: [sourceLink], sources: [source] };
    const chosen = depositService.findDeposit(creep, snapshot, {});
    assert.equal(chosen, flagged);
});

test('findDeposit skips source links via excludeTypes', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 100, store: { [RESOURCE_ENERGY]: 100 } });
    const sourceLink = mocks.mockStructure(STRUCTURE_LINK, { id: 'slink', pos: pos(10, 10), energy: 0, capacity: 800 });
    const source = mocks.mockSource({ id: 'src1', pos: pos(11, 10) });
    const snapshot = { energyStructures: [], storage: null, containers: [], links: [sourceLink], sources: [source] };
    const chosen = depositService.findDeposit(creep, snapshot, { excludeTypes: { [STRUCTURE_LINK]: true } });
    assert.equal(chosen, null);
});

// Regression guard: findDeposit must use snapshot objects directly, not
// re-fetch them via Game.getObjectById. Stage a container in the snapshot
// that is NOT registered in Game.objectsById. The old code called
// getObjectById(c.id) → null and filtered it out; the new code uses the
// snapshot object directly and includes it.
test('findDeposit uses snapshot objects directly without a getObjectById re-fetch', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ pos: pos(25, 25), capacity: 100, store: { [RESOURCE_ENERGY]: 100 } });
    // Build a container-shaped object NOT registered via Game._registerObject.
    // Game.getObjectById('unregistered-cont') returns null, so the old code
    // would skip it. The new code uses the snapshot reference directly.
    const unregistered = {
        id: 'unregistered-cont',
        structureType: STRUCTURE_CONTAINER,
        pos: mocks.makePos(pos(27, 25)),
        store: {
            [RESOURCE_ENERGY]: 0,
            getCapacity: function () { return 2000; },
            getFreeCapacity: function () { return 2000; },
            getUsedCapacity: function () { return 0; },
        },
    };
    assert.equal(Game.getObjectById('unregistered-cont'), null);
    const snapshot = { energyStructures: [], storage: null, containers: [unregistered], links: [], sources: [] };
    const chosen = depositService.findDeposit(creep, snapshot, {});
    assert.equal(chosen, unregistered);
});
