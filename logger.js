const _lastPeriodic = {};

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
    console.log(message);
}

function event(category, message) {
    if (!shouldLog(category)) return;
    console.log(message);
}

function statusLine(creep) {
    const role = creep.memory.role || 'unknown';
    const task = creep.memory.taskId || 'none';
    const carry = (creep.store[RESOURCE_ENERGY] || 0) + '/' + (creep.store.getCapacity() || 0);
    const pos = creep.pos.x + ',' + creep.pos.y;
    const action = creep.memory._action || '';
    return creep.name + ' [' + role + '] task=' + task + ' carry=' + carry + ' pos=' + pos + (action ? ' (' + action + ')' : '');
}

function setAction(creep, action) {
    creep.memory._action = action;
}

module.exports = {
    getMode: getMode,
    shouldLog: shouldLog,
    periodic: periodic,
    event: event,
    statusLine: statusLine,
    setAction: setAction,
};
