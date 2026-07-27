'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../../mocks/screeps');
const roomManager = require('../../../src/managers/roomManager');
const linkService = require('../../../src/managers/upkeep/linkService');

function pos(x, y) {
    return { x: x, y: y, roomName: 'W1N1' };
}

// Build a link and attach a room with controller (my) + storage so the
// dispatcher's inRangeTo checks work. The mock's default room has neither.
function makeLink(opts) {
    const link = mocks.mockStructure(STRUCTURE_LINK, {
        id: opts.id,
        pos: opts.pos,
        energy: opts.energy !== undefined ? opts.energy : 100,
        capacity: opts.capacity || 800,
        cooldown: opts.cooldown || 0,
    });
    link.room = {
        name: 'W1N1',
        controller: opts.controller === null ? null : { pos: opts.controllerPos || pos(20, 20), my: true },
        storage: opts.storage === null ? null : { pos: opts.storagePos || pos(30, 30) },
    };
    return link;
}

function withSnap(snap, fn) {
    const origGet = roomManager.get;
    roomManager.get = function () { return snap; };
    try {
        fn();
    } finally {
        roomManager.get = origGet;
    }
}

// --- isSourceLink helper ---

test('isSourceLink is true for a link within range 3 of a source', function () {
    mocks.resetGame();
    const link = makeLink({ id: 'slink', pos: pos(10, 10) });
    const source = mocks.mockSource({ id: 'src1', pos: pos(11, 10) });
    assert.equal(linkService.isSourceLink(link, [source]), true);
});

test('isSourceLink is false for a link far from any source', function () {
    mocks.resetGame();
    const link = makeLink({ id: 'clink', pos: pos(20, 20) });
    const source = mocks.mockSource({ id: 'src1', pos: pos(45, 45) });
    assert.equal(linkService.isSourceLink(link, [source]), false);
});

test('isSourceLink handles null/empty inputs', function () {
    assert.equal(linkService.isSourceLink(null, []), false);
    assert.equal(linkService.isSourceLink({ pos: pos(1, 1) }, null), false);
});

// --- runLink source -> controller transfer ---

test('runLink transfers from a source link to a controller link at range 4', function () {
    mocks.resetGame();
    // Controller link at range 4 from the controller (20,20) -> (20,24).
    // This is the off-by-one regression guard: linkStrategy places at range
    // 1-4, so a range-4 controller link must still be detected.
    const sourceLink = makeLink({ id: 'slink', pos: pos(10, 10), energy: 500 });
    const controllerLink = makeLink({
        id: 'clink', pos: pos(20, 24), energy: 0, capacity: 800,
        controllerPos: pos(20, 20), storage: null,
    });
    const source = mocks.mockSource({ id: 'src1', pos: pos(11, 10) });
    withSnap({ sources: [source], links: [sourceLink, controllerLink] }, function () {
        linkService.runLink(sourceLink);
        assert.equal(sourceLink._lastTransferTarget, controllerLink);
    });
});

test('runLink falls back to the storage link when the controller link is full', function () {
    mocks.resetGame();
    const sourceLink = makeLink({ id: 'slink', pos: pos(10, 10), energy: 500 });
    const controllerLink = makeLink({
        id: 'clink', pos: pos(20, 21), energy: 795, capacity: 800,
        controllerPos: pos(20, 20), storage: null,
    });
    const storageLink = makeLink({
        id: 'stlink', pos: pos(30, 31), energy: 0, capacity: 800,
        controller: null, storagePos: pos(30, 30),
    });
    const source = mocks.mockSource({ id: 'src1', pos: pos(11, 10) });
    withSnap({ sources: [source], links: [sourceLink, controllerLink, storageLink] }, function () {
        linkService.runLink(sourceLink);
        assert.equal(sourceLink._lastTransferTarget, storageLink);
    });
});

test('runLink does not transfer when both controller and storage links are full', function () {
    mocks.resetGame();
    const sourceLink = makeLink({ id: 'slink', pos: pos(10, 10), energy: 500 });
    const controllerLink = makeLink({
        id: 'clink', pos: pos(20, 21), energy: 795, capacity: 800,
        controllerPos: pos(20, 20), storage: null,
    });
    const storageLink = makeLink({
        id: 'stlink', pos: pos(30, 31), energy: 795, capacity: 800,
        controller: null, storagePos: pos(30, 30),
    });
    const source = mocks.mockSource({ id: 'src1', pos: pos(11, 10) });
    withSnap({ sources: [source], links: [sourceLink, controllerLink, storageLink] }, function () {
        linkService.runLink(sourceLink);
        assert.equal(sourceLink._lastTransferTarget, undefined);
    });
});

test('runLink does not transfer when the source link is on cooldown', function () {
    mocks.resetGame();
    const sourceLink = makeLink({ id: 'slink', pos: pos(10, 10), energy: 500, cooldown: 2 });
    const controllerLink = makeLink({
        id: 'clink', pos: pos(20, 21), energy: 0, capacity: 800,
        controllerPos: pos(20, 20), storage: null,
    });
    const source = mocks.mockSource({ id: 'src1', pos: pos(11, 10) });
    withSnap({ sources: [source], links: [sourceLink, controllerLink] }, function () {
        linkService.runLink(sourceLink);
        assert.equal(sourceLink._lastTransferTarget, undefined);
    });
});

test('runLink does not transfer when the source link has less than 50 energy', function () {
    mocks.resetGame();
    const sourceLink = makeLink({ id: 'slink', pos: pos(10, 10), energy: 49 });
    const controllerLink = makeLink({
        id: 'clink', pos: pos(20, 21), energy: 0, capacity: 800,
        controllerPos: pos(20, 20), storage: null,
    });
    const source = mocks.mockSource({ id: 'src1', pos: pos(11, 10) });
    withSnap({ sources: [source], links: [sourceLink, controllerLink] }, function () {
        linkService.runLink(sourceLink);
        assert.equal(sourceLink._lastTransferTarget, undefined);
    });
});

test('runLink is a no-op on a non-source link (the storage link has no source nearby)', function () {
    mocks.resetGame();
    const storageLink = makeLink({
        id: 'stlink', pos: pos(30, 31), energy: 500, capacity: 800,
        controller: null, storagePos: pos(30, 30),
    });
    const source = mocks.mockSource({ id: 'src1', pos: pos(10, 10) });
    withSnap({ sources: [source], links: [storageLink] }, function () {
        linkService.runLink(storageLink);
        assert.equal(storageLink._lastTransferTarget, undefined);
    });
});

test('runLink skips a controller link on cooldown and falls back to the storage link', function () {
    mocks.resetGame();
    const sourceLink = makeLink({ id: 'slink', pos: pos(10, 10), energy: 500 });
    const controllerLink = makeLink({
        id: 'clink', pos: pos(20, 21), energy: 0, capacity: 800, cooldown: 3,
        controllerPos: pos(20, 20), storage: null,
    });
    const storageLink = makeLink({
        id: 'stlink', pos: pos(30, 31), energy: 0, capacity: 800,
        controller: null, storagePos: pos(30, 30),
    });
    const source = mocks.mockSource({ id: 'src1', pos: pos(11, 10) });
    withSnap({ sources: [source], links: [sourceLink, controllerLink, storageLink] }, function () {
        linkService.runLink(sourceLink);
        assert.equal(sourceLink._lastTransferTarget, storageLink);
    });
});

// --- runLink loss-aware transfer amount ---

test('runLink transfer amount accounts for the 3% link loss', function () {
    mocks.resetGame();
    // Source has more than enough: targetFree=800, needed=ceil(800/0.97)=825.
    const sourceLink = makeLink({ id: 'slink', pos: pos(10, 10), energy: 1000, capacity: 1000 });
    const controllerLink = makeLink({
        id: 'clink', pos: pos(20, 21), energy: 0, capacity: 800,
        controllerPos: pos(20, 20), storage: null,
    });
    const source = mocks.mockSource({ id: 'src1', pos: pos(11, 10) });
    withSnap({ sources: [source], links: [sourceLink, controllerLink] }, function () {
        linkService.runLink(sourceLink);
        assert.equal(sourceLink._lastTransferAmount, 825);
    });
});

test('runLink caps the transfer amount at the source link energy', function () {
    mocks.resetGame();
    // Source 500, targetFree=800, needed=825 → amount=min(500,825)=500.
    const sourceLink = makeLink({ id: 'slink', pos: pos(10, 10), energy: 500, capacity: 1000 });
    const controllerLink = makeLink({
        id: 'clink', pos: pos(20, 21), energy: 0, capacity: 800,
        controllerPos: pos(20, 20), storage: null,
    });
    const source = mocks.mockSource({ id: 'src1', pos: pos(11, 10) });
    withSnap({ sources: [source], links: [sourceLink, controllerLink] }, function () {
        linkService.runLink(sourceLink);
        assert.equal(sourceLink._lastTransferAmount, 500);
    });
});

test('runLink fills a partial target exactly after loss', function () {
    mocks.resetGame();
    // Source 1000, target 700/800 → targetFree=100, needed=ceil(100/0.97)=104.
    const sourceLink = makeLink({ id: 'slink', pos: pos(10, 10), energy: 1000, capacity: 1000 });
    const controllerLink = makeLink({
        id: 'clink', pos: pos(20, 21), energy: 700, capacity: 800,
        controllerPos: pos(20, 20), storage: null,
    });
    const source = mocks.mockSource({ id: 'src1', pos: pos(11, 10) });
    withSnap({ sources: [source], links: [sourceLink, controllerLink] }, function () {
        linkService.runLink(sourceLink);
        assert.equal(sourceLink._lastTransferAmount, 104);
    });
});