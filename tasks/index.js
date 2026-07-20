var taskBase = require('taskBase');

var harvest = require('task.harvest');
var mine = require('task.mine');
var haul = require('task.haul');
var sweep = require('task.sweep');
var build = require('task.build');
var repair = require('task.repair');
var upgrade = require('task.upgrade');
var defend = require('task.defend');
var heal = require('task.heal');

var registry = {
    harvest: harvest,
    mine: mine,
    haul: haul,
    sweep: sweep,
    build: build,
    repair: repair,
    upgrade: upgrade,
    defend: defend,
    heal: heal,
};

function get(type) {
    return registry[type] || null;
}

function list(room, snapshot) {
    if (!room || !snapshot) return [];
    var out = [];
    for (var type in registry) {
        if (!registry.hasOwnProperty(type)) continue;
        var tt = registry[type];
        var items = tt.listFor(room, snapshot);
        for (var i = 0; i < items.length; i++) out.push(items[i]);
    }
    return out;
}

function run(type, creep, task) {
    var tt = get(type);
    if (!tt) return true;
    return tt.run(creep, task);
}

function canDo(type, creep) {
    var tt = get(type);
    if (!tt) return false;
    return tt.canDo(creep);
}

function cap(type) {
    var tt = get(type);
    if (!tt) return 99;
    return tt.cap;
}

function all() {
    return registry;
}

module.exports = {
    get: get,
    list: list,
    run: run,
    canDo: canDo,
    cap: cap,
    all: all,
    taskBase: taskBase,
};
