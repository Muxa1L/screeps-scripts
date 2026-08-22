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
    const mem = ensureCreepMemory(creep);
    mem._refueling = false;
    mem._refuelSourceId = null;
}

function getRefuelSource(creep) {
    return ensureCreepMemory(creep)._refuelSourceId || null;
}

function setRefuelSource(creep, id) {
    ensureCreepMemory(creep)._refuelSourceId = id;
}

function clearRefuelSource(creep) {
    ensureCreepMemory(creep)._refuelSourceId = null;
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

// Distinct from _recycling (used by the stuck-recycle path) so the obsolete
// recycle driver in creepRunner doesn't interfere with stuckRecycleService.
function getObsoleteRecycling(creep) {
    return ensureCreepMemory(creep)._obsoleteRecycling || false;
}

function setObsoleteRecycling(creep, tick) {
    ensureCreepMemory(creep)._obsoleteRecycling = tick;
}

function clearObsoleteRecycling(creep) {
    delete ensureCreepMemory(creep)._obsoleteRecycling;
}

// Emergency no-MOVE creeps (e.g. [CARRY]-only bootstrap distributors) are
// spawned intentionally without MOVE during a total colony deadlock. They are
// exempt from the no-MOVE auto-recycle so the bootstrap can actually run.
function getEmergencyNoMove(creep) {
    return ensureCreepMemory(creep)._emergencyNoMove || false;
}

function setEmergencyNoMove(creep) {
    ensureCreepMemory(creep)._emergencyNoMove = true;
}

function getRenewComplete(creep) {
    return ensureCreepMemory(creep)._renewComplete || 0;
}

function setRenewComplete(creep, tick) {
    ensureCreepMemory(creep)._renewComplete = tick;
}

function getRenewing(creep) {
    return ensureCreepMemory(creep)._renewing || false;
}

function setRenewing(creep, value) {
    ensureCreepMemory(creep)._renewing = value;
}

function clearRenewing(creep) {
    delete ensureCreepMemory(creep)._renewing;
}

function getRoomMemory(roomName) {
    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
    return Memory.rooms[roomName];
}

function getSourceMemory(id) {
    if (!Memory.sources) Memory.sources = {};
    if (!Memory.sources[id]) {
        Memory.sources[id] = { roomName: '', x: 0, y: 0, slots: [] };
    }
    return Memory.sources[id];
}

// Squad accessors
function getSquadId(creep) {
    return ensureCreepMemory(creep).squadId || null;
}

function setSquadId(creep, id) {
    ensureCreepMemory(creep).squadId = id;
}

function clearSquadId(creep) {
    delete ensureCreepMemory(creep).squadId;
}

function getSquadRole(creep) {
    return ensureCreepMemory(creep).squadRole || null;
}

function setSquadRole(creep, role) {
    ensureCreepMemory(creep).squadRole = role;
}

function clearSquadRole(creep) {
    delete ensureCreepMemory(creep).squadRole;
}

function getSquadTarget(creep) {
    return ensureCreepMemory(creep).squadTarget || null;
}

function setSquadTarget(creep, targetId) {
    ensureCreepMemory(creep).squadTarget = targetId;
    ensureCreepMemory(creep).squadTargetTick = Game.time;
}

function clearSquadTarget(creep) {
    delete ensureCreepMemory(creep).squadTarget;
    delete ensureCreepMemory(creep).squadTargetTick;
}

function getSquadTargetTick(creep) {
    return ensureCreepMemory(creep).squadTargetTick || 0;
}

// Intel / squads / expansion / remote room memory accessors
function ensureIntel() {
    if (!Memory.intel) {
        Memory.intel = { queue: [], scanCursor: 0, raids: {}, rooms: {} };
    }
    if (!Memory.intel.rooms) Memory.intel.rooms = {};
    return Memory.intel;
}

function getIntel() {
    return ensureIntel();
}

function ensureIntelRooms() {
    return ensureIntel().rooms;
}

function ensureSquads() {
    if (!Memory.squads) Memory.squads = {};
    return Memory.squads;
}

function getSquads() {
    return ensureSquads();
}

function getExpansion() {
    if (!Memory.expansion) Memory.expansion = { history: [] };
    return Memory.expansion;
}

function ensureExpansion() {
    if (!Memory.expansion) Memory.expansion = { history: [] };
    if (!Memory.expansion.history) Memory.expansion.history = [];
    // Trim history to prevent unbounded growth over long sessions.
    if (Memory.expansion.history.length > 50) Memory.expansion.history.shift();
    return Memory.expansion;
}

function addExpansionHistory(entry) {
    const exp = ensureExpansion();
    exp.history.push(entry);
    if (exp.history.length > 50) exp.history.splice(0, exp.history.length - 50);
}

// Per-room memory accessors for expansion fields. Memory.rooms[name] is
// initialized lazily; callers pass the room name (not a Room object) so
// these work for rooms that are not currently visible.
function ensureRoomMem(roomName) {
    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
    return Memory.rooms[roomName];
}

function getRoomBootstrapping(roomName) {
    const mem = Memory.rooms && Memory.rooms[roomName];
    return !!(mem && mem.bootstrapping);
}

function setRoomBootstrapping(roomName, homeRoom) {
    const mem = ensureRoomMem(roomName);
    mem.bootstrapping = true;
    if (homeRoom) mem.homeRoom = homeRoom;
}

function clearRoomBootstrapping(roomName) {
    const mem = ensureRoomMem(roomName);
    mem.bootstrapping = false;
}

function getRoomHomeRoom(roomName) {
    const mem = Memory.rooms && Memory.rooms[roomName];
    return (mem && mem.homeRoom) || null;
}

function setRoomHomeRoom(roomName, homeRoom) {
    ensureRoomMem(roomName).homeRoom = homeRoom;
}

function ensureRemoteRooms() {
    if (!Memory.remoteRooms) Memory.remoteRooms = {};
    return Memory.remoteRooms;
}

function getRemoteRooms() {
    return ensureRemoteRooms();
}

// Bootstrap / homeRoom accessors
function getHomeRoom(creep) {
    return ensureCreepMemory(creep).homeRoom || null;
}

function setHomeRoom(creep, roomName) {
    ensureCreepMemory(creep).homeRoom = roomName;
}

function getBootstrapRoom(creep) {
    return ensureCreepMemory(creep).bootstrapRoom || null;
}

function setBootstrapRoom(creep, roomName) {
    ensureCreepMemory(creep).bootstrapRoom = roomName;
}

function clearBootstrapRoom(creep) {
    delete ensureCreepMemory(creep).bootstrapRoom;
}

// --- Nuke detection ---

function ensureNuke() {
    if (Memory.nuke === undefined) {
        Memory.nuke = { events: {}, evacuating: {}, stat: { nukesDetected: 0, safeModeTriggered: 0, roomsEvacuated: 0 } };
    }
    return Memory.nuke;
}

function getNukeEvents() {
    return ensureNuke().events;
}

function getNukeEvac(roomName) {
    const nuke = ensureNuke();
    return nuke.evacuating[roomName] === true;
}

function setNukeEvac(roomName) {
    ensureNuke().evacuating[roomName] = true;
}

function clearNukeEvac(roomName) {
    delete ensureNuke().evacuating[roomName];
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
    getRefuelSource: getRefuelSource,
    setRefuelSource: setRefuelSource,
    clearRefuelSource: clearRefuelSource,
    getSourceId: getSourceId,
    setSourceId: setSourceId,
    clearSourceId: clearSourceId,
    getRecycling: getRecycling,
    setRecycling: setRecycling,
    clearRecycling: clearRecycling,
    getObsoleteRecycling: getObsoleteRecycling,
    getEmergencyNoMove: getEmergencyNoMove,
    setEmergencyNoMove: setEmergencyNoMove,
    setObsoleteRecycling: setObsoleteRecycling,
    clearObsoleteRecycling: clearObsoleteRecycling,
    getRenewComplete: getRenewComplete,
    setRenewComplete: setRenewComplete,
    getRenewing: getRenewing,
    setRenewing: setRenewing,
    clearRenewing: clearRenewing,
    getRoomMemory: getRoomMemory,
    getSourceMemory: getSourceMemory,
    getSquadId: getSquadId,
    setSquadId: setSquadId,
    clearSquadId: clearSquadId,
    getSquadRole: getSquadRole,
    setSquadRole: setSquadRole,
    clearSquadRole: clearSquadRole,
    getSquadTarget: getSquadTarget,
    setSquadTarget: setSquadTarget,
    clearSquadTarget: clearSquadTarget,
    getSquadTargetTick: getSquadTargetTick,
    ensureIntel: ensureIntel,
    getIntel: getIntel,
    ensureIntelRooms: ensureIntelRooms,
    ensureSquads: ensureSquads,
    getSquads: getSquads,
    getExpansion: getExpansion,
    ensureExpansion: ensureExpansion,
    addExpansionHistory: addExpansionHistory,
    getRoomBootstrapping: getRoomBootstrapping,
    setRoomBootstrapping: setRoomBootstrapping,
    clearRoomBootstrapping: clearRoomBootstrapping,
    getRoomHomeRoom: getRoomHomeRoom,
    setRoomHomeRoom: setRoomHomeRoom,
    ensureRemoteRooms: ensureRemoteRooms,
    getRemoteRooms: getRemoteRooms,
    getHomeRoom: getHomeRoom,
    setHomeRoom: setHomeRoom,
    getBootstrapRoom: getBootstrapRoom,
    setBootstrapRoom: setBootstrapRoom,
    clearBootstrapRoom: clearBootstrapRoom,
    ensureNuke: ensureNuke,
    getNukeEvents: getNukeEvents,
    getNukeEvac: getNukeEvac,
    setNukeEvac: setNukeEvac,
    clearNukeEvac: clearNukeEvac,
};
