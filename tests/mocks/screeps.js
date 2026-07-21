'use strict';

// Minimal Screeps global stubs for Node parse-checks and unit tests.
// These values match the string constants used by the Screeps runtime.

const BODY_PARTS = ['MOVE', 'WORK', 'CARRY', 'ATTACK', 'RANGED_ATTACK', 'HEAL', 'CLAIM', 'TOUGH'];
BODY_PARTS.forEach(function (p) {
    global[p] = p.toLowerCase();
});

const STRUCTURES = [
    'STRUCTURE_SPAWN',
    'STRUCTURE_EXTENSION',
    'STRUCTURE_ROAD',
    'STRUCTURE_WALL',
    'STRUCTURE_RAMPART',
    'STRUCTURE_KEEPER_LAIR',
    'STRUCTURE_PORTAL',
    'STRUCTURE_CONTROLLER',
    'STRUCTURE_LINK',
    'STRUCTURE_STORAGE',
    'STRUCTURE_TOWER',
    'STRUCTURE_OBSERVER',
    'STRUCTURE_POWER_BANK',
    'STRUCTURE_POWER_SPAWN',
    'STRUCTURE_EXTRACTOR',
    'STRUCTURE_LAB',
    'STRUCTURE_TERMINAL',
    'STRUCTURE_CONTAINER',
    'STRUCTURE_NUKER',
    'STRUCTURE_FACTORY',
    'STRUCTURE_INVADER_CORE',
];
STRUCTURES.forEach(function (s) {
    global[s] = s.replace('STRUCTURE_', '').toLowerCase();
});

const RESOURCES = [
    'RESOURCE_ENERGY',
    'RESOURCE_POWER',
    'RESOURCE_HYDROGEN',
    'RESOURCE_OXYGEN',
    'RESOURCE_UTRIUM',
    'RESOURCE_LEMERGIUM',
    'RESOURCE_KEANIUM',
    'RESOURCE_ZYNTHIUM',
    'RESOURCE_CATALYST',
    'RESOURCE_GHODIUM',
    'RESOURCE_SILICON',
    'RESOURCE_METAL',
    'RESOURCE_BIOMASS',
    'RESOURCE_OXIDANT',
    'RESOURCE_REDUCTANT',
    'RESOURCE_PURIFIER',
    'RESOURCE_BATTERY',
    'RESOURCE_COMPOSITE',
    'RESOURCE_CRYSTAL',
    'RESOURCE_LIQUID',
    'RESOURCE_WIRE',
    'RESOURCE_SWITCH',
    'RESOURCE_TRANSISTOR',
    'RESOURCE_MICROCHIP',
    'RESOURCE_CIRCUIT',
    'RESOURCE_DEVICE',
    'RESOURCE_CELL',
    'RESOURCE_PHLEGM',
    'RESOURCE_TISSUE',
    'RESOURCE_MUSCLE',
    'RESOURCE_ORGANOID',
    'RESOURCE_HORMONE',
    'RESOURCE_ALLOY',
    'RESOURCE_TUBE',
    'RESOURCE_FIXTURES',
    'RESOURCE_FRAME',
    'RESOURCE_HYDRAULICS',
    'RESOURCE_MACHINE',
    'RESOURCE_CONDENSATE',
    'RESOURCE_CONCENTRATE',
    'RESOURCE_EXTRACT',
    'RESOURCE_SPIRIT',
    'RESOURCE_EMANATION',
    'RESOURCE_ESSENCE',
];
RESOURCES.forEach(function (r) {
    global[r] = r.replace('RESOURCE_', '').toLowerCase();
});

const FIND = [
    'FIND_EXIT_TOP',
    'FIND_EXIT_RIGHT',
    'FIND_EXIT_BOTTOM',
    'FIND_EXIT_LEFT',
    'FIND_EXIT',
    'FIND_CREEPS',
    'FIND_MY_CREEPS',
    'FIND_HOSTILE_CREEPS',
    'FIND_SOURCES_ACTIVE',
    'FIND_SOURCES',
    'FIND_DROPPED_RESOURCES',
    'FIND_STRUCTURES',
    'FIND_MY_STRUCTURES',
    'FIND_HOSTILE_STRUCTURES',
    'FIND_FLAGS',
    'FIND_CONSTRUCTION_SITES',
    'FIND_MY_SPAWNS',
    'FIND_HOSTILE_SPAWNS',
    'FIND_MY_CONSTRUCTION_SITES',
    'FIND_HOSTILE_CONSTRUCTION_SITES',
    'FIND_MINERALS',
    'FIND_NUKES',
    'FIND_TOMBSTONES',
    'FIND_POWER_CREEPS',
    'FIND_MY_POWER_CREEPS',
    'FIND_HOSTILE_POWER_CREEPS',
    'FIND_RUINS',
    'FIND_HOSTILE_CREEPS_LOW',
];
FIND.forEach(function (f) {
    global[f] = f;
});

const LOOK = [
    'LOOK_TERRAIN',
    'LOOK_CREEPS',
    'LOOK_STRUCTURES',
    'LOOK_CONSTRUCTION_SITES',
    'LOOK_RESOURCES',
    'LOOK_SOURCES',
    'LOOK_MINERALS',
    'LOOK_NUKES',
    'LOOK_FLAGS',
    'LOOK_ENERGY',
    'LOOK_POWER_CREEPS',
    'LOOK_RUINS',
    'LOOK_TOMBSTONES',
];
LOOK.forEach(function (l) {
    global[l] = l;
});

const RETURN_CODES = {
    OK: 0,
    ERR_NOT_OWNER: -1,
    ERR_NO_PATH: -2,
    ERR_NAME_EXISTS: -3,
    ERR_BUSY: -4,
    ERR_NOT_FOUND: -5,
    ERR_NOT_ENOUGH_ENERGY: -6,
    ERR_NOT_ENOUGH_RESOURCES: -6,
    ERR_INVALID_TARGET: -7,
    ERR_FULL: -8,
    ERR_NOT_IN_RANGE: -9,
    ERR_INVALID_ARGS: -10,
    ERR_TIRED: -11,
    ERR_NO_BODYPART: -12,
    ERR_RCL_NOT_ENOUGH: -14,
    ERR_GCL_NOT_ENOUGH: -15,
};
Object.keys(RETURN_CODES).forEach(function (k) {
    global[k] = RETURN_CODES[k];
});

// Action power constants used by task cost calculations.
global.UPGRADE_CONTROLLER_POWER = 1;
global.BUILD_POWER = 5;
global.REPAIR_POWER = 100;
global.HARVEST_POWER = 2;
global.ATTACK_CONTROLLER_POWER = 1;

global.Game = global.Game || {
    time: 0,
    rooms: {},
    creeps: {},
    spawns: {},
    structures: {},
    constructionSites: {},
    flags: {},
    cpu: { bucket: 10000, tickLimit: 500, getUsed: function () { return 0; } },
    shard: { name: 'sim', type: 'normal', ptr: false },
    map: { describeExits: function () { return {}; } },
    getObjectById: function (_id) { return null; },
};

global.Memory = global.Memory || {};

function resetMemory() {
    global.Memory = {};
}

function resetGame() {
    global.Game = {
        time: 0,
        rooms: {},
        creeps: {},
        spawns: {},
        structures: {},
        constructionSites: {},
        flags: {},
        cpu: { bucket: 10000, tickLimit: 500, getUsed: function () { return 0; } },
        shard: { name: 'sim', type: 'normal', ptr: false },
        map: { describeExits: function () { return {}; } },
        getObjectById: function (_id) { return null; },
    };
}

function makePos(p) {
    p = p || { x: 25, y: 25, roomName: 'W1N1' };
    return {
        x: p.x,
        y: p.y,
        roomName: p.roomName || 'W1N1',
        isNearTo: function (target) {
            const t = target.pos || target;
            return Math.abs(this.x - t.x) <= 1 && Math.abs(this.y - t.y) <= 1 && this.roomName === (t.roomName || this.roomName);
        },
        isEqualTo: function (target) {
            const t = target.pos || target;
            return this.x === t.x && this.y === t.y && this.roomName === (t.roomName || this.roomName);
        },
        inRangeTo: function (target, range) {
            const t = target.pos || target;
            return Math.abs(this.x - t.x) <= range && Math.abs(this.y - t.y) <= range;
        },
        findClosestByPath: function (items) { return items && items.length ? items[0] : null; },
        findClosestByRange: function (items) { return items && items.length ? items[0] : null; },
    };
}

function mockCreep(options) {
    options = options || {};
    const store = options.store || {};
    const capacity = options.capacity !== undefined ? options.capacity : 50;
    return {
        name: options.name || 'TestCreep',
        memory: options.memory || {},
        pos: makePos(options.pos),
        store: {
            [RESOURCE_ENERGY]: store[RESOURCE_ENERGY] || 0,
            getCapacity: function (type) { return type === RESOURCE_ENERGY ? capacity : capacity; },
            getFreeCapacity: function (type) { return (type === RESOURCE_ENERGY ? capacity : capacity) - (store[type] || 0); },
            getUsedCapacity: function (type) { return store[type] || 0; },
        },
        getActiveBodyparts: function (part) { return (options.parts || {})[part] || 0; },
        say: function () {},
        move: function () { return OK; },
        moveTo: function (_target, _opts) { return OK; },
        transfer: function (_target, _rtype) { return OK; },
        withdraw: function (_target, _rtype) { return OK; },
        pickup: function (_target) { return OK; },
        harvest: function (_target) { return OK; },
        attack: function (_target) { return OK; },
        rangedAttack: function (_target) { return OK; },
        heal: function (_target) { return OK; },
        build: function (_target) { return OK; },
        repair: function (_target) { return OK; },
        upgradeController: function (_target) { return OK; },
    };
}

function mockStructure(type, options) {
    options = options || {};
    const energy = options.energy || 0;
    const capacity = options.capacity !== undefined ? options.capacity : 100;
    const free = options.freeCapacity !== undefined ? options.freeCapacity : capacity - energy;
    return {
        id: options.id || type + '_' + Math.random().toString(36).slice(2),
        structureType: type,
        pos: makePos(options.pos),
        store: {
            [RESOURCE_ENERGY]: energy,
            getCapacity: function (rtype) { return rtype === RESOURCE_ENERGY ? capacity : capacity; },
            getFreeCapacity: function (rtype) { return rtype === RESOURCE_ENERGY ? free : free; },
            getUsedCapacity: function (rtype) { return rtype === RESOURCE_ENERGY ? energy : 0; },
        },
    };
}

function mockSource(options) {
    options = options || {};
    return {
        id: options.id || 'source_' + Math.random().toString(36).slice(2),
        pos: makePos(options.pos),
        energy: options.energy || 1000,
        store: undefined,
        amount: undefined,
    };
}

function mockDroppedResource(amount, p) {
    return {
        id: 'drop_' + Math.random().toString(36).slice(2),
        pos: makePos(p),
        resourceType: RESOURCE_ENERGY,
        amount: amount || 50,
    };
}

module.exports = {
    resetMemory: resetMemory,
    resetGame: resetGame,
    makePos: makePos,
    mockCreep: mockCreep,
    mockStructure: mockStructure,
    mockSource: mockSource,
    mockDroppedResource: mockDroppedResource,
};
