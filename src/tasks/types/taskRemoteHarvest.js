const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');
const roomFlags = require('../../utils/roomFlags');
const roomManager = require('../../managers/roomManager');
const PRIORITY = require('../../config/priorities');

// A travel-dispatcher task for remote harvest. Generated only in owned
// (home) rooms, it targets sources in whitelisted foreign rooms. The creep
// walks cross-room to the target; on arrival the task releases so the
// per-room `harvest` task (built from the remote room's snapshot) takes
// over. When full, the creep follows the existing foreign-room logic home
// to deposit (forceTargetFor returns null for unowned rooms -> idle
// fallback -> nearestSpawn). Empty again at home -> re-dispatched.
//
// Priority (95) sits just above HARVEST (90) so local harvest always wins,
// and below every other in-room task. Remote harvest is therefore a
// surplus-labor fallback: harvesters commute only when there is no local
// work they can take.
module.exports = {
    type: 'remoteHarvest',
    priority: PRIORITY.REMOTE_HARVEST,
    requirements: { work: 1, carry: 1 },
    cap: 2,
    canDo: function (creep) {
        return creep.getActiveBodyparts(WORK) > 0 && creep.getActiveBodyparts(CARRY) > 0;
    },
    tasks: function (room, _snap) {
        // Only the home (owned) room dispatches remote harvest.
        if (!room.controller || !room.controller.my) return [];
        const out = [];
        const allowed = roomFlags.getAllowedRooms();
        if (!Memory.sources) return out;
        for (const roomName in allowed) {
            if (roomName === room.name) continue;
            // Collect registered sources for this whitelisted room.
            const found = [];
            for (const id in Memory.sources) {
                const src = Memory.sources[id];
                if (src.roomName !== roomName) continue;
                found.push({ id: id, x: src.x, y: src.y });
            }
            if (found.length > 0) {
                for (let i = 0; i < found.length; i++) {
                    const s = found[i];
                    const pos = { x: s.x, y: s.y, roomName: roomName };
                    if (roomManager.isPosNearHostile(roomName, pos, 5)) continue;
                    out.push({ target: { id: s.id, pos: pos } });
                }
            } else {
                // No creep has visited this room yet, so its sources are
                // unknown. Dispatch a scout target at the room center; on
                // arrival the room becomes visible, the registration step
                // populates Memory.sources, and subsequent commutes use the
                // real source positions.
                out.push({ target: { id: 'scout:' + roomName, pos: { x: 25, y: 25, roomName: roomName } } });
            }
        }
        return out;
    },
    score: function (creep, target) {
        return taskBase.approxDistance(creep, target);
    },
    run: function (creep, task, _snap) {
        const target = task.target;
        if (!target || !target.pos) return false;
        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return false;
        // Arrived in the remote room: release so the per-room `harvest`
        // task takes over (the remote room's snapshot lists its sources).
        if (creep.pos.roomName === target.pos.roomName) return false;
        const dest = new RoomPosition(target.pos.x, target.pos.y, target.pos.roomName);
        move.action(creep, 'remote->' + target.pos.roomName);
        move.moveCreep(creep, dest, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 20 });
        return true;
    },
};