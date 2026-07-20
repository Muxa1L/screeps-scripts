var _lastPeriodic = {};

function getMode() {
    if (!Memory.flags) return 'normal';
    if (Memory.flags.verbose) return 'verbose';
    if (Memory.flags.quiet) return 'quiet';
    return 'normal';
}

function shouldLog(category) {
    var mode = getMode();
    if (mode === 'quiet') return false;
    if (mode === 'verbose') return true;
    var enabled = Memory.logCategories;
    if (enabled && enabled[category] === false) return false;
    return true;
}

function periodic(category, interval, key, message) {
    if (!shouldLog(category)) return;
    var t = Game.time;
    var slot = Math.floor(t / interval);
    var id = category + ':' + key + ':' + slot;
    if (_lastPeriodic[id] === slot) return;
    _lastPeriodic[id] = slot;
    console.log(message);
}

function event(category, message) {
    if (!shouldLog(category)) return;
    console.log(message);
}

function statusLine(creep) {
    var role = creep.memory.role || 'unknown';
    var task = creep.memory.taskId || 'none';
    var carry = (creep.store[RESOURCE_ENERGY] || 0) + '/' + (creep.store.getCapacity() || 0);
    var pos = creep.pos.x + ',' + creep.pos.y;
    var action = creep.memory._action || '';
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
