'use strict';

const assert = require('./assert');
const migrations = require('./migrations');

function init() {
    assert.init();
    migrations.runMigrations();
}

function ensureRoomMemory(room) {
    if (!room) return null;
    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[room.name]) {
        Memory.rooms[room.name] = {
            lastSeen: Game.time,
        };
    }
    return Memory.rooms[room.name];
}

function tick() {
    init();
    for (const name in Game.rooms) {
        const room = Game.rooms[name];
        if (!room.controller || !room.controller.my) continue;
        const mem = ensureRoomMemory(room);
        mem.lastSeen = Game.time;
    }
}

module.exports = {
    tick: tick,
    ensureRoomMemory: ensureRoomMemory,
    init: init,
};