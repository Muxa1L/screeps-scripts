function ensureCreepMemory(creep) {
    if (!creep.memory) creep.memory = {};
    return creep.memory;
}

function getRole(creep) {
    return ensureCreepMemory(creep).role || null;
}

function setRole(creep, role) {
    ensureCreepMemory(creep).role = role;
}

function getTaskId(creep) {
    return ensureCreepMemory(creep).taskId || null;
}

function setTaskId(creep, taskId) {
    ensureCreepMemory(creep).taskId = taskId;
}

function clearTaskId(creep) {
    ensureCreepMemory(creep).taskId = null;
}

function getFailedTasks(creep) {
    return ensureCreepMemory(creep)._failedTasks || {};
}

function addFailedTask(creep, taskId, ttlTicks) {
    const mem = ensureCreepMemory(creep);
    if (!mem._failedTasks) mem._failedTasks = {};
    mem._failedTasks[taskId] = Game.time + ttlTicks;
}

function cleanupFailedTasks(creep) {
    const mem = ensureCreepMemory(creep);
    if (!mem._failedTasks) return;
    const now = Game.time;
    for (const id in mem._failedTasks) {
        if (mem._failedTasks[id] <= now) delete mem._failedTasks[id];
    }
    if (Object.keys(mem._failedTasks).length === 0) delete mem._failedTasks;
}

function getLastTaskChange(creep) {
    return ensureCreepMemory(creep)._lastTaskChange || 0;
}

function setLastTaskChange(creep, tick) {
    ensureCreepMemory(creep)._lastTaskChange = tick;
}

function getMoveFailures(creep) {
    return ensureCreepMemory(creep)._moveFailures || 0;
}

function setMoveFailures(creep, n) {
    ensureCreepMemory(creep)._moveFailures = n;
}

function getMoveTargetId(creep) {
    return ensureCreepMemory(creep)._moveTargetId || null;
}

function setMoveTargetId(creep, id) {
    ensureCreepMemory(creep)._moveTargetId = id;
}

function getLastMoveResult(creep) {
    return ensureCreepMemory(creep)._lastMoveResult !== undefined ? ensureCreepMemory(creep)._lastMoveResult : null;
}

function setLastMoveResult(creep, result) {
    ensureCreepMemory(creep)._lastMoveResult = result;
}

function getAction(creep) {
    return ensureCreepMemory(creep)._action || '';
}

function setAction(creep, action) {
    ensureCreepMemory(creep)._action = action;
}

function getHauledFrom(creep) {
    return ensureCreepMemory(creep)._hauledFrom || null;
}

function setHauledFrom(creep, id) {
    ensureCreepMemory(creep)._hauledFrom = id;
}

function clearHauledFrom(creep) {
    ensureCreepMemory(creep)._hauledFrom = null;
}

function getRefueling(creep) {
    return ensureCreepMemory(creep)._refueling || false;
}

function setRefueling(creep, value) {
    ensureCreepMemory(creep)._refueling = value;
}

function clearRefueling(creep) {
    ensureCreepMemory(creep)._refueling = false;
}

function getSourceId(creep) {
    return ensureCreepMemory(creep).sourceId || null;
}

function setSourceId(creep, id) {
    ensureCreepMemory(creep).sourceId = id;
}

function clearSourceId(creep) {
    ensureCreepMemory(creep).sourceId = null;
}

function getRecycling(creep) {
    return ensureCreepMemory(creep)._recycling || false;
}

function setRecycling(creep, tick) {
    ensureCreepMemory(creep)._recycling = tick;
}

function clearRecycling(creep) {
    delete ensureCreepMemory(creep)._recycling;
}

function getRenewComplete(creep) {
    return ensureCreepMemory(creep)._renewComplete || 0;
}

function setRenewComplete(creep, tick) {
    ensureCreepMemory(creep)._renewComplete = tick;
}

function getRoomMemory(roomName) {
    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
    return Memory.rooms[roomName];
}

function getSourceMemory(id) {
    if (!Memory.sources) Memory.sources = {};
    if (!Memory.sources[id]) {
        return {
            roomName: '',
            x: 0,
            y: 0,
            slots: [],
        };
    }
    return Memory.sources[id];
}

module.exports = {
    getRole: getRole,
    setRole: setRole,
    getTaskId: getTaskId,
    setTaskId: setTaskId,
    clearTaskId: clearTaskId,
    getFailedTasks: getFailedTasks,
    addFailedTask: addFailedTask,
    cleanupFailedTasks: cleanupFailedTasks,
    getLastTaskChange: getLastTaskChange,
    setLastTaskChange: setLastTaskChange,
    getMoveFailures: getMoveFailures,
    setMoveFailures: setMoveFailures,
    getMoveTargetId: getMoveTargetId,
    setMoveTargetId: setMoveTargetId,
    getLastMoveResult: getLastMoveResult,
    setLastMoveResult: setLastMoveResult,
    getAction: getAction,
    setAction: setAction,
    getHauledFrom: getHauledFrom,
    setHauledFrom: setHauledFrom,
    clearHauledFrom: clearHauledFrom,
    getRefueling: getRefueling,
    setRefueling: setRefueling,
    clearRefueling: clearRefueling,
    getSourceId: getSourceId,
    setSourceId: setSourceId,
    clearSourceId: clearSourceId,
    getRecycling: getRecycling,
    setRecycling: setRecycling,
    clearRecycling: clearRecycling,
    getRenewComplete: getRenewComplete,
    setRenewComplete: setRenewComplete,
    getRoomMemory: getRoomMemory,
    getSourceMemory: getSourceMemory,
};
