const memory = require('../utils/memorySchema');
const constants = require('../config/constants');

// Runs every tick (bucket > 1000). For each room flagged as bootstrapping:
//   - Queue a STRUCTURE_SPAWN site at the ClaimTarget flag position if no
//     spawn exists yet.
//   - Monitor RCL: once a spawn exists and RCL >= 2, clear bootstrapping
//     (the new room joins normal per-room management).
//   - On failed claim (controller owned by enemy), cancel, log to history,
//     clear the target.
function tick() {
    if (!Memory.flags || !Memory.flags.expansion) return;
    if (!Memory.rooms) return;

    const exp = memory.ensureExpansion();
    for (const roomName in Memory.rooms) {
        const m = Memory.rooms[roomName];
        if (!m || !m.bootstrapping) continue;
        const room = Game.rooms[roomName];

        // If we can see the room and the controller is owned by an enemy, abort.
        if (room && room.controller && room.controller.owner && !room.controller.my) {
            exp.history.push({ roomName: roomName, claimedTick: null, abandonedTick: Game.time, reason: 'enemy-claimed' });
            memory.clearRoomBootstrapping(roomName);
            if (exp.target && exp.target.roomName === roomName) delete exp.target;
            continue;
        }

        if (!room) continue; // not visible; wait for an observer/claim to reveal it

        // Once a spawn exists and RCL >= 2, the new room joins normal rotation.
        const spawns = room.find(FIND_MY_SPAWNS);
        if (spawns.length > 0 && room.controller && room.controller.my && room.controller.level >= 2) {
            memory.clearRoomBootstrapping(roomName);
            if (exp.target && exp.target.roomName === roomName) delete exp.target;
            exp.history.push({ roomName: roomName, claimedTick: m.claimedTick || Game.time, abandonedTick: null, reason: null });
            continue;
        }

        // Queue the spawn construction site at the ClaimTarget flag position.
        if (spawns.length === 0) {
            const flag = Game.flags && (Game.flags['ClaimTarget' + roomName] || Game.flags['ClaimTarget']);
            let pos = null;
            if (flag && flag.pos && flag.pos.roomName === roomName) {
                pos = flag.pos;
            } else if (room.controller) {
                pos = room.controller.pos;
            }
            if (pos) {
                // Only place the site if no construction site exists at this tile.
                const existing = room.find(FIND_MY_CONSTRUCTION_SITES, {
                    filter: function (s) { return s.structureType === STRUCTURE_SPAWN && s.pos.x === pos.x && s.pos.y === pos.y; },
                });
                if (existing.length === 0) {
                    const r = new RoomPosition(pos.x, pos.y, roomName).createConstructionSite(STRUCTURE_SPAWN);
                    // Ignore most errors; RCL or hostile terrain may block for a tick.
                    if (r !== OK && r !== ERR_INVALID_TARGET && r !== ERR_RCL_NOT_ENOUGH) {
                        // rare; log only on unexpected failures
                    }
                }
            }
        }
    }
}

module.exports = {
    tick: tick,
};