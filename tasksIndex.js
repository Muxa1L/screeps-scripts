var taskBase = require('taskBase');

var harvest = require('taskHarvest');
var mine = require('taskMine');
var haul = require('taskHaul');
var sweep = require('taskSweep');
var build = require('taskBuild');
var repair = require('taskRepair');
var upgrade = require('taskUpgrade');
var defend = require('taskDefend');
var heal = require('taskHeal');

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

function score(type, creep, target) {
    var tt = get(type);
    if (!tt || !tt.score) return taskBase.approxDistance(creep, target);
    return tt.score(creep, target);
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
    score: score,
    all: all,
    taskBase: taskBase,
};
