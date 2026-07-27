'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../mocks/screeps');
const memory = require('../../src/utils/memorySchema');
const squadManager = require('../../src/managers/squadManager');

function pos(x, y) {
    return { x: x, y: y, roomName: 'W1N1' };
}

function makeFighter(name, opts) {
    opts = opts || {};
    const c = mocks.mockCreep({
        name: name,
        pos: opts.pos || pos(10, 10),
        parts: { attack: 2, move: 2, tough: 2 },
    });
    c.id = name;
    c.hits = opts.hits || 300;
    c.hitsMax = opts.hitsMax || 300;
    memory.setRole(c, 'fighter');
    Game.creeps[name] = c;
    return c;
}

function makeHealer(name, opts) {
    opts = opts || {};
    const c = mocks.mockCreep({
        name: name,
        pos: opts.pos || pos(10, 10),
        parts: { heal: 2, move: 2, tough: 2 },
    });
    c.id = name;
    c.hits = opts.hits || 300;
    c.hitsMax = opts.hitsMax || 300;
    memory.setRole(c, 'healer');
    Game.creeps[name] = c;
    return c;
}

test('formation pulls medic toward leader when separated', function () {
    mocks.resetGame();
    Memory.flags = { squads: true };
    const leader = makeFighter('F1', { pos: pos(10, 10) });
    const medic = makeHealer('H1', { pos: pos(20, 10) });
    memory.setSquadId(leader, 's1');
    memory.setSquadRole(leader, 'leader');
    memory.setSquadId(medic, 's1');
    memory.setSquadRole(medic, 'medic');

    let medicTarget = null;
    medic.moveTo = function (target, _opts) { medicTarget = target; return OK; };

    squadManager.tick();

    assert.ok(medicTarget && medicTarget.id === leader.id, 'medic should path toward leader when separated');
});

test('target sharing writes squadTarget on both creeps when leader sees a hostile', function () {
    mocks.resetGame();
    Memory.flags = { squads: true };
    const leader = makeFighter('F1');
    const medic = makeHealer('H1');
    memory.setSquadId(leader, 's1');
    memory.setSquadId(medic, 's1');

    const hostile = mocks.mockCreep({
        name: 'Enemy1', pos: pos(12, 10),
        parts: { attack: 1, move: 1 },
    });
    hostile.id = 'enemy1';
    hostile.hits = 100;
    hostile.hitsMax = 100;
    Game._registerObject(hostile);
    leader.pos.findClosestByRange = function () { return hostile; };

    squadManager.tick();

    assert.equal(memory.getSquadTarget(leader), hostile.id);
    assert.equal(memory.getSquadTarget(medic), hostile.id);
});

test('mutual retreat triggers when leader drops below threshold', function () {
    mocks.resetGame();
    Memory.flags = { squads: true };
    const leader = makeFighter('F1', { hits: 100, hitsMax: 300 });
    const medic = makeHealer('H1');
    memory.setSquadId(leader, 's1');
    memory.setSquadId(medic, 's1');

    const spawn = mocks.mockStructure(STRUCTURE_SPAWN, {
        id: 'spawn1', pos: pos(5, 5),
    });
    Game.spawns['Spawn1'] = spawn;
    Game._registerObject(spawn);
    leader.pos.findClosestByRange = function () { return spawn; };
    medic.pos.findClosestByRange = function () { return spawn; };

    squadManager.tick();

    assert.equal(Memory.squads.s1.status, 'retreating');
});

test('broken squad cleaned up when both creeps are gone', function () {
    mocks.resetGame();
    Memory.flags = { squads: true };
    Memory.squads = {
        dead: { leaderId: 'gone1', medicId: 'gone2', formedTick: 1 },
    };
    squadManager.tick();
    assert.equal(Memory.squads.dead, undefined);
});

test('squad manager no-op when squads flag is off', function () {
    mocks.resetGame();
    Memory.flags = { squads: false };
    const leader = makeFighter('F1');
    const medic = makeHealer('H1', { pos: pos(20, 10) });
    memory.setSquadId(leader, 's1');
    memory.setSquadId(medic, 's1');

    let medicTarget = null;
    medic.moveTo = function (target, _opts) { medicTarget = target; return OK; };

    squadManager.tick();

    assert.equal(medicTarget, null);
});
