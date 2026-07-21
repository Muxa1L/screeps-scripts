const taskBase = require('taskBase');

const harvest = require('taskHarvest');
const mine = require('taskMine');
const haul = require('taskHaul');
const supply = require('taskSupply');
const sweep = require('taskSweep');
const build = require('taskBuild');
const repair = require('taskRepair');
const upgrade = require('taskUpgrade');
const defend = require('taskDefend');
const heal = require('taskHeal');

const registry = {
    harvest: harvest,
    mine: mine,
    haul: haul,
    supply: supply,
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
    const out = [];
    const types = Object.keys(registry);
    for (let t = 0; t < types.length; t++) {
        const tt = registry[types[t]];
        const items = tt.listFor(room, snapshot);
        for (let i = 0; i < items.length; i++) out.push(items[i]);
    }
    return out;
}

function run(type, creep, task) {
    const tt = get(type);
    if (!tt) return true;
    return tt.run(creep, task);
}

function canDo(type, creep) {
    const tt = get(type);
    if (!tt) return false;
    return tt.canDo(creep);
}

function cap(type, room, snapshot) {
    const tt = get(type);
    if (!tt) return 99;
    if (typeof tt.capFor === 'function' && room && snapshot) {
        return tt.capFor(room, snapshot);
    }
    return tt.cap;
}

function score(type, creep, target) {
    const tt = get(type);
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
