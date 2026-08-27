// terminalService — outbound/inbound energy/resource transfers between rooms.
//
// On RCL5 the room has no terminal, so every helper is a noop. The plan is
// to keep the same public API and let it light up automatically when the
// terminal structure appears. The shape of the API (target by roomName, cost
// estimation, queue dedup) is the hard part; the calls themselves are
// trivial once the terminal exists.
//
// Use cases at RCL6+:
//   - Send energy from a saturated home room to a remote boot/claim target
//   - Receive energy from a remote miner room to refill home storage
//   - Trade resources through the market (out of scope for now)
//
// Cooldown is the real constraint: terminalSend has a per-terminal cooldown
// of 10 ticks between transfers. The cache below lets callers probe without
// hitting the same room repeatedly in one tick.

const roomManager = require('../managers/roomManager');

// Track the last tick we successfully sent from each terminal to respect
// the 10-tick cooldown without re-checking on every caller. Cleared lazily
// when the cooldown naturally expires.
const _lastSendTick = {};

// Cheap estimate so callers can pick a target without querying every room.
// Real cost depends on the linear distance formula the server uses; this
// is good enough for ranking.
function estimateCost(fromRoomName, toRoomName, amount) {
    if (!fromRoomName || !toRoomName || !amount) return 0;
    const from = roomManager.get(fromRoomName);
    const to = roomManager.get(toRoomName);
    if (!from || !to || !from.terminal || !to.terminal) return 0;
    const fromCoords = fromRoomName.match(/([EW])(\d+)([NS])(\d+)/);
    const toCoords = toRoomName.match(/([EW])(\d+)([NS])(\d+)/);
    if (!fromCoords || !toCoords) return 0;
    const fx = (fromCoords[1] === 'W' ? -1 : 1) * parseInt(fromCoords[2], 10);
    const fy = (fromCoords[3] === 'N' ? -1 : 1) * parseInt(fromCoords[4], 10);
    const tx = (toCoords[1] === 'W' ? -1 : 1) * parseInt(toCoords[2], 10);
    const ty = (toCoords[3] === 'N' ? -1 : 1) * parseInt(toCoords[4], 10);
    const dx = Math.abs(fx - tx);
    const dy = Math.abs(fy - ty);
    return Math.ceil(0.1 * Math.max(dx, dy) * amount);
}

function findTerminal(roomName) {
    const snap = roomManager.get(roomName);
    if (snap && snap.terminal) return snap.terminal;
    const room = Game.rooms[roomName];
    if (room && room.terminal) return room.terminal;
    return null;
}

function canSend(roomName) {
    const t = findTerminal(roomName);
    if (!t) return false;
    if (t.cooldown > 0) return false;
    if (_lastSendTick[roomName] && (Game.time - _lastSendTick[roomName]) < 10) return false;
    return true;
}

// Send `amount` of `resourceType` to `toRoomName`. Returns the result code
// (OK on success, ERR_* otherwise). Noop-with-OK when the terminal is
// missing, so callers don't need to gate by RCL.
function send(roomName, toRoomName, resourceType, amount) {
    const fromTerm = findTerminal(roomName);
    if (!fromTerm) return OK; // noop on RCL5
    if (roomName === toRoomName) return ERR_INVALID_ARGS;
    if (!canSend(roomName)) return ERR_TIRED;

    const toTerm = findTerminal(toRoomName);
    if (!toTerm) return ERR_INVALID_TARGET;

    const have = fromTerm.store[resourceType] || 0;
    const free = toTerm.store.getFreeCapacity(resourceType) || 0;
    if (have < amount) amount = have;
    if (free < amount) amount = free;
    if (amount <= 0) return ERR_FULL;

    const res = fromTerm.send(resourceType, amount, toRoomName);
    if (res === OK) {
        _lastSendTick[roomName] = Game.time;
    }
    return res;
}

// Receive from another room's terminal. Symmetric to send() — same cooldown
// rules apply. Used when a remote-mining room has surplus and pumps back.
function receive(roomName, fromRoomName, resourceType, amount) {
    return send(fromRoomName, roomName, resourceType, amount);
}

module.exports = {
    send: send,
    receive: receive,
    canSend: canSend,
    estimateCost: estimateCost,
    findTerminal: findTerminal,
};
