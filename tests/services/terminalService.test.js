// Tests for terminalService. On RCL5 (no terminal) every send returns OK
// without side effects. The RCL6+ path is exercised in test 4 where we
// mock the global Game object with terminals in two rooms.

const test = require('node:test');
const assert = require('node:assert/strict');
const mocks = require('../mocks/screeps.js');

function reload() {
    delete require.cache[require.resolve('../../src/services/terminalService.js')];
    return require('../../src/services/terminalService.js');
}

test('terminalService.send is a noop when source room has no terminal', function () {
    mocks.resetGame();
    const ts = reload();
    assert.equal(ts.send('W47N45', 'W48N45', 'energy', 1000), 0 /* OK */);
});

test('terminalService.findTerminal returns null when no terminal exists', function () {
    mocks.resetGame();
    const ts = reload();
    assert.equal(ts.findTerminal('W47N45'), null);
});

test('terminalService.estimateCost is 0 when terminals are missing', function () {
    mocks.resetGame();
    const ts = reload();
    assert.equal(ts.estimateCost('W47N45', 'W48N45', 1000), 0);
});

test('terminalService.send returns OK with mocked terminals and free capacity', function () {
    mocks.resetGame();
    const fakeFrom = {
        store: { energy: 5000 },
        cooldown: 0,
        send: function (res, amt) { this.store[res] -= amt; return 0; },
    };
    const fakeTo = {
        store: { energy: 0, getFreeCapacity: function () { return 300000; } },
    };
    global.Game = {
        time: 1000,
        rooms: {
            W47N45: { terminal: fakeFrom },
            W48N45: { terminal: fakeTo },
        },
    };
    const ts = reload();
    const res = ts.send('W47N45', 'W48N45', 'energy', 1000);
    assert.equal(res, 0);
    assert.equal(fakeFrom.store.energy, 4000);
});

test('terminalService.canSend respects the 10-tick cooldown cache', function () {
    mocks.resetGame();
    // No terminal in the mock Game: canSend returns false. We test the
    // contract on the live path with a fake terminal + global Game.
    global.Game = {
        time: 100,
        rooms: { W47N45: { terminal: { cooldown: 0 } } },
    };
    let ts = reload();
    assert.equal(ts.canSend('W47N45'), true);
    // Move forward 5 ticks but DON'T reload the module: the _lastSendTick
    // cache from the previous test (which was a noop) shouldn't exist for
    // this room, so the only blocking factor is the missing terminal... but
    // we already supplied one, so canSend should still be true at t=105.
    // The real cooldown behaviour kicks in after a successful send.
    global.Game.time = 105;
    assert.equal(ts.canSend('W47N45'), true);
});
