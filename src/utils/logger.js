const constants = require('../config/constants');
const memorySchema = require('./memorySchema');

const _lastPeriodic = {};
const MAX_PERIODIC_KEYS = constants.MAX_PERIODIC_KEYS;

function getMode() {
    if (!Memory.flags) return 'normal';
    if (Memory.flags.verbose) return 'verbose';
    if (Memory.flags.quiet) return 'quiet';
    return 'normal';
}

function shouldLog(category) {
    const mode = getMode();
    if (mode === 'quiet') return false;
    if (mode === 'verbose') return true;
    const enabled = Memory.logCategories;
    if (enabled && enabled[category] === false) return false;
    return true;
}


function periodic(category, interval, key, message) {
    if (!shouldLog(category)) return;
    const t = Game.time;
    const slot = Math.floor(t / interval);
    const id = category + ':' + key + ':' + slot;
    if (_lastPeriodic[id] === slot) return;
    _lastPeriodic[id] = slot;
    if (t % 1000 === 0) {
        const keys = Object.keys(_lastPeriodic);
        if (keys.length > MAX_PERIODIC_KEYS) {
            for (let i = 0; i < keys.length - MAX_PERIODIC_KEYS; i++) {
                delete _lastPeriodic[keys[i]];
            }
        }
    }
    console.log(message);
}

function event(category, message) {
    if (!shouldLog(category)) return;
    console.log(message);
}

function statusLine(creep) {
    const role = memorySchema.getRole(creep) || 'unknown';
    const task = memorySchema.getTaskId(creep) || 'none';
    const carry = (creep.store[RESOURCE_ENERGY] || 0) + '/' + (creep.store.getCapacity() || 0);
    const pos = creep.pos.x + ',' + creep.pos.y;
    const action = memorySchema.getAction(creep);
    return creep.name + ' [' + role + '] task=' + task + ' carry=' + carry + ' pos=' + pos + (action ? ' (' + action + ')' : '');
}

function setAction(creep, action) {
    memorySchema.setAction(creep, action);
}

module.exports = {
    getMode: getMode,
    shouldLog: shouldLog,
    periodic: periodic,
    event: event,
    statusLine: statusLine,
    setAction: setAction,
};
