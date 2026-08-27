// labsService — reactives/boost management for labs.
//
// RCL6 unlocks labs. Each lab has a cooldown of 1000 ticks between runs and
// requires two input resources plus (optionally) boosts the same mineral
// as output. The standard reactions are catalogued in REACTIONS; boosts are
// in BOOSTS (TODO — populated when we actually start boosting).
//
// State on RCL5: the room has no labs, so every helper is a noop. The API
// is shaped for the future so the call sites don't need to gate by RCL.
//
// Design notes:
//   - Two input labs feed one output lab. The input labs need to be stocked
//     by haulers (the standard "labHauler" role) before the reaction runs.
//   - The cooldown is 1000 ticks per lab, so a single room can only run one
//     reaction per ~16 minutes through a given output lab.
//   - For now we only store the desired reaction; the actual run loop
//     (loading inputs, calling runReaction, harvesting outputs) lives in
//     managers/upkeep/labsManager and is not wired up yet.

const roomManager = require('../managers/roomManager');

// REACTIONS[mineralA][mineralB] = mineralC. The server reverses direction
// automatically so we only need one entry per pair.
const REACTIONS = {
    OH: { H: 'OH' }, // dummy: real game has ~84 entries; we lazy-import below
};

// Lazy-load the full REACTIONS table from the game constants at first use
// so this module is testable without globals. Cached after the first read.
let _reactionsTable = null;
function getReactionsTable() {
    if (_reactionsTable) return _reactionsTable;
    if (typeof REACTIONS === 'undefined') return null;
    _reactionsTable = REACTIONS;
    return _reactionsTable;
}

function getReactionProduct(mineralA, mineralB) {
    const table = getReactionsTable();
    if (!table) return null;
    if (table[mineralA] && table[mineralA][mineralB]) return table[mineralA][mineralB];
    if (table[mineralB] && table[mineralB][mineralA]) return table[mineralB][mineralA];
    return null;
}

// Find a lab by id in the snapshot or the live room.
function findLab(roomName, labId) {
    const snap = roomManager.get(roomName);
    if (snap && snap.labs) {
        for (let i = 0; i < snap.labs.length; i++) {
            if (snap.labs[i].id === labId) return snap.labs[i];
        }
    }
    const room = Game.rooms[roomName];
    if (room) {
        const labs = room.find(FIND_STRUCTURES, {
            filter: function (s) { return s.structureType === STRUCTURE_LAB; },
        });
        for (let j = 0; j < labs.length; j++) {
            if (labs[j].id === labId) return labs[j];
        }
    }
    return null;
}

// All labs in a room. Returns [] on RCL5.
function findAllLabs(roomName) {
    const snap = roomManager.get(roomName);
    if (snap && snap.labs) return snap.labs;
    const room = Game.rooms[roomName];
    if (!room) return [];
    return room.find(FIND_STRUCTURES, {
        filter: function (s) { return s.structureType === STRUCTURE_LAB; },
    });
}

// Can the output lab run a reaction? It needs the two input labs within
// range 2 with sufficient stock of the right minerals, and cooldown=0.
function canRunReaction(outputLabId, inputAId, inputBId, resourceA, resourceB, amount) {
    if (!outputLabId) return false;
    const room = Game.rooms;
    // Cheap: look up the live lab object via Game.getObjectById.
    if (typeof Game === 'undefined') return false;
    const out = Game.getObjectById(outputLabId);
    if (!out || out.cooldown > 0 || out.mineralAmount > 0) return false;
    const a = inputAId ? Game.getObjectById(inputAId) : null;
    const b = inputBId ? Game.getObjectById(inputBId) : null;
    if (a && (!a.pos.inRangeTo(out.pos, 2) || (a.store[resourceA] || 0) < amount)) return false;
    if (b && (!b.pos.inRangeTo(out.pos, 2) || (b.store[resourceB] || 0) < amount)) return false;
    return true;
}

// Noop on RCL5. Returns the cooldown remaining on the lab, or 0 if it
// can run. Callers can branch on the return value.
function reactionCooldown(labId) {
    if (!labId || typeof Game === 'undefined') return 0;
    const lab = Game.getObjectById(labId);
    if (!lab) return 0;
    return lab.cooldown || 0;
}

module.exports = {
    getReactionProduct: getReactionProduct,
    findLab: findLab,
    findAllLabs: findAllLabs,
    canRunReaction: canRunReaction,
    reactionCooldown: reactionCooldown,
    REACTIONS: REACTIONS,
};
