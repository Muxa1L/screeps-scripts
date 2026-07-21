const taskBase = require('./taskBase');
const TaskType = require('./taskBaseClass');

const harvestSpec = require('./types/taskHarvest');
const mineSpec = require('./types/taskMine');
const haulSpec = require('./types/taskHaul');
const supplySpec = require('./types/taskSupply');
const sweepSpec = require('./types/taskSweep');
const buildSpec = require('./types/taskBuild');
const repairSpec = require('./types/taskRepair');
const upgradeSpec = require('./types/taskUpgrade');
const defendSpec = require('./types/taskDefend');
const healSpec = require('./types/taskHeal');

const registry = {
    harvest: new TaskType(harvestSpec),
    mine: new TaskType(mineSpec),
    haul: new TaskType(haulSpec),
    supply: new TaskType(supplySpec),
    sweep: new TaskType(sweepSpec),
    build: new TaskType(buildSpec),
    repair: new TaskType(repairSpec),
    upgrade: new TaskType(upgradeSpec),
    defend: new TaskType(defendSpec),
    heal: new TaskType(healSpec),
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

function run(type, creep, task, snapshot) {
    const tt = get(type);
    if (!tt) return true;
    return tt.run(creep, task, snapshot);
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
