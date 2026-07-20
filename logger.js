var _lastPeriodic = {};
var _lastStateSeen = {};

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
    var carry = (creep.carry.energy || 0) + '/' + (creep.carryCapacity || 0);
    var pos = creep.pos.x + ',' + creep.pos.y;
    var action = creep.memory._action || '';
    return creep.name + ' [' + role + '] task=' + task + ' carry=' + carry + ' pos=' + pos + (action ? ' (' + action + ')' : '');
}

function describeTask(task) {
    if (!task) return 'none';
    var tgt = task.target;
    var tgtId = (tgt && tgt.id) || '?';
    var tgtName = '';
    if (tgt) {
        if (tgt.structureType) tgtName = tgt.structureType;
        else if (tgt.name) tgtName = tgt.name;
        else if (tgt.amount !== undefined) tgtName = 'drop=' + tgt.amount;
    }
    return task.type + '@' + tgtId + (tgtName ? '(' + tgtName + ')' : '');
}

function setAction(creep, action) {
    creep.memory._action = action;
}

function clearAction(creep) {
    delete creep.memory._action;
}

module.exports = {
    getMode: getMode,
    shouldLog: shouldLog,
    periodic: periodic,
    event: event,
    statusLine: statusLine,
    describeTask: describeTask,
    setAction: setAction,
    clearAction: clearAction,
};
