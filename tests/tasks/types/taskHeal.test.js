'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../../mocks/screeps');
const taskHeal = require('../../../src/tasks/types/taskHeal');

function makeHealer(opts) {
    const c = mocks.mockCreep({
        name: opts.name || 'Healer1',
        pos: { x: 25, y: 25, roomName: 'W1N1' },
        parts: { heal: 2, move: 2 },
    });
    c.id = opts.id || 'healer1';
    c.hits = opts.hits !== undefined ? opts.hits : 1000;
    c.hitsMax = opts.hitsMax || 1000;
    if (opts.squadLeader) c.memory.squadLeader = opts.squadLeader;
    let healedId = null;
    let rangedHealedId = null;
    c.heal = function (t) { healedId = t.id || t; return OK; };
    c.rangedHeal = function (t) { rangedHealedId = t.id || t; return OK; };
    c._healedId = function () { return healedId; };
    c._rangedHealedId = function () { return rangedHealedId; };
    return c;
}

function makeLeader(opts) {
    const c = mocks.mockCreep({
        name: 'Fighter1',
        pos: opts.pos || { x: 26, y: 25, roomName: 'W1N1' },
        parts: { attack: 3, move: 3 },
    });
    c.id = opts.id || 'fighter1';
    c.hits = opts.hits;
    c.hitsMax = opts.hitsMax || 1000;
    Game._registerObject(c);
    return c;
}

test('taskHeal heals the squad leader when it is damaged', function () {
    mocks.resetGame();
    const leader = makeLeader({ id: 'fighter1', hits: 600, hitsMax: 1000 });
    Game._registerObject(leader);
    const healer = makeHealer({ id: 'healer1', squadLeader: 'fighter1' });
    // The task target is a different damaged friendly; the leader must win.
    const other = makeLeader({ id: 'other1', hits: 500, hitsMax: 1000 });
    Game._registerObject(other);
    const result = taskHeal.run(healer, { target: other }, {});
    assert.equal(result, true);
    assert.equal(healer._healedId(), 'fighter1');
});

test('taskHeal falls through to the task target when the squad leader is dead', function () {
    mocks.resetGame();
    const healer = makeHealer({ id: 'healer1', squadLeader: 'gone' });
    const target = makeLeader({ id: 'target1', hits: 500, hitsMax: 1000 });
    Game._registerObject(target);
    const result = taskHeal.run(healer, { target: target }, {});
    assert.equal(result, true);
    assert.equal(healer._healedId(), 'target1');
    // The stale squadLeader link must be cleared.
    assert.equal(healer.memory.squadLeader, undefined);
});

test('taskHeal falls through to the task target when the squad leader is at full health', function () {
    mocks.resetGame();
    const leader = makeLeader({ id: 'fighter1', hits: 1000, hitsMax: 1000 });
    Game._registerObject(leader);
    const healer = makeHealer({ id: 'healer1', squadLeader: 'fighter1' });
    const target = makeLeader({ id: 'target1', hits: 500, hitsMax: 1000 });
    Game._registerObject(target);
    const result = taskHeal.run(healer, { target: target }, {});
    assert.equal(result, true);
    assert.equal(healer._healedId(), 'target1');
});

test('taskHeal self-heals when the healer is more damaged than the squad leader', function () {
    mocks.resetGame();
    const leader = makeLeader({ id: 'fighter1', hits: 900, hitsMax: 1000 });
    Game._registerObject(leader);
    const healer = makeHealer({ id: 'healer1', squadLeader: 'fighter1', hits: 400, hitsMax: 1000 });
    const result = taskHeal.run(healer, { target: leader }, {});
    assert.equal(result, true);
    assert.equal(healer._healedId(), healer.id);
});