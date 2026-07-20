let _lastErrors = [];
const MAX_ERRORS = 50;

function init() {
    if (!Memory.stats) Memory.stats = {};
    if (!Memory.stats.errors) Memory.stats.errors = {};
    if (!Memory.stats.lastErrors) Memory.stats.lastErrors = [];
    if (!Memory.stats.startTick) Memory.stats.startTick = Game.time;
}

function recordError(module, error) {
    init();
    Memory.stats.errors[module] = (Memory.stats.errors[module] || 0) + 1;
    const entry = {
        tick: Game.time,
        module: module,
        message: (error && error.message) || String(error),
        stack: (error && error.stack) || '',
    };
    Memory.stats.lastErrors.push(entry);
    if (Memory.stats.lastErrors.length > MAX_ERRORS) {
        Memory.stats.lastErrors.splice(0, Memory.stats.lastErrors.length - MAX_ERRORS);
    }
    _lastErrors.push(entry);
    if (_lastErrors.length > MAX_ERRORS) {
        _lastErrors.splice(0, _lastErrors.length - MAX_ERRORS);
    }
    console.log('[' + Game.time + '] [error] [' + module + '] ' + entry.message);
}

function safeRun(module, fn) {
    try {
        return fn();
    } catch (e) {
        recordError(module, e);
        return null;
    }
}

function safeTick(module, fn) {
    return safeRun(module, fn);
}

function assert(cond, message) {
    if (cond) return true;
    const msg = message || 'assertion failed';
    recordError('assert', { message: msg });
    return false;
}

function lastErrors() {
    return _lastErrors;
}

function clear() {
    _lastErrors = [];
    if (Memory.stats) {
        Memory.stats.errors = {};
        Memory.stats.lastErrors = [];
    }
}

module.exports = {
    init: init,
    recordError: recordError,
    safeRun: safeRun,
    safeTick: safeTick,
    assert: assert,
    lastErrors: lastErrors,
    clear: clear,
};
