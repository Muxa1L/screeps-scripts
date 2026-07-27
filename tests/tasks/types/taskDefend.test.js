'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../../mocks/screeps');
const memory = require('../../../src/utils/memorySchema');
const taskDefend = require('../../../src/tasks/types/taskDefend');

function pos(x, y, roomName) {
    return { x: x, y: y, roomName: roomName || 'W1N1' };
}

function makeHostile(id, p, hits) {
    const h = mocks.mockCreep({ name: id, pos: p, parts: {} });
    h.id = id;
    h.hits = hits === undefined ? 100 : hits;
    h.hitsMax = 100;
    return h;
}

test('canDo requires ATTACK or RANGED_ATTACK parts', function () {
    const melee = mocks.mockCreep({ name: 'M', parts: { attack: 1 } });
    const ranged = mocks.mockCreep({ name: 'R', parts: { ranged_attack: 1 } });
    const neither = mocks.mockCreep({ name: 'N', parts: {} });
    assert.equal(taskDefend.canDo(melee), true);
    assert.equal(taskDefend.canDo(ranged), true);
    assert.equal(taskDefend.canDo(neither), false);
});

test('tasks emits one task per hostile in the snapshot', function () {
    mocks.resetGame();
    const h1 = makeHostile('h1', pos(10, 10));
    const h2 = makeHostile('h2', pos(20, 20));
    const snap = { hostiles: [h1, h2] };
    const tasks = taskDefend.tasks({ name: 'W1N1' }, snap);
    assert.equal(tasks.length, 2);
});

test('run returns false when the target is gone', function () {
    mocks.resetGame();
    const creep = mocks.mockCreep({ name: 'D1', pos: pos(25, 25), parts: { attack: 1 } });
    const result = taskDefend.run(creep, { target: { id: 'missing' } }, null);
    assert.equal(result, false);
});

test('run retreats to nearest spawn when below SQUAD_RETREAT_HP_RATIO', function () {
    mocks.resetGame();
    const spawn = mocks.mockStructure(STRUCTURE_SPAWN, { id: 's1', pos: pos(10, 10) });
    spawn.structureType = STRUCTURE_SPAWN;
    spawn.room = { name: 'W1N1' };
    Game.spawns = { Spawn1: spawn };
    const hostile = makeHostile('h1', pos(20, 20));
    Game._registerObject(hostile);
    const creep = mocks.mockCreep({ name: 'D1', pos: pos(25, 25), parts: { attack: 1 } });
    creep.hits = 10; creep.hitsMax = 100; // 10% < 40% threshold
    creep.pos.findClosestByRange = function () { return spawn; };
    const result = taskDefend.run(creep, { target: hostile }, null);
    assert.equal(result, true);
});

test('run attacks the nearest hostile when in range', function () {
    mocks.resetGame();
    const hostile = makeHostile('h1', pos(26, 25));
    Game._registerObject(hostile);
    const creep = mocks.mockCreep({ name: 'D1', pos: pos(25, 25), parts: { attack: 1 } });
    creep.hits = 100; creep.hitsMax = 100;
    creep.pos.findClosestByRange = function () { return hostile; };
    creep.pos.inRangeTo = function () { return true; };
    let attacked = false;
    creep.attack = function (t) { attacked = true; return OK; };
    const result = taskDefend.run(creep, { target: hostile }, null);
    assert.equal(result, true);
    assert.equal(attacked, true);
});

test('run prefers a latched squad target over findClosestByRange', function () {
    mocks.resetGame();
    const latched = makeHostile('latched', pos(10, 10));
    const nearest = makeHostile('nearest', pos(26, 25));
    Game._registerObject(latched);
    Game._registerObject(nearest);
    const creep = mocks.mockCreep({ name: 'D1', pos: pos(25, 25), parts: { attack: 1 } });
    creep.hits = 100; creep.hitsMax = 100;
    memory.setSquadTarget(creep, 'latched');
    // setSquadTarget also writes squadTargetTick = Game.time
    creep.pos.findClosestByRange = function () { return nearest; };
    creep.pos.inRangeTo = function () { return true; };
    let attackedId = null;
    creep.attack = function (t) { attackedId = t.id; return OK; };
    taskDefend.run(creep, { target: nearest }, null);
    assert.equal(attackedId, 'latched');
});