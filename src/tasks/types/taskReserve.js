const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');
const memory = require('../../utils/memorySchema');

function myUsername() {
    // Prefer the explicit Screeps API; fall back to any owned spawn's owner
    // username (spawn.owner is {username: "..."} on live spawns).
    if (Game.username) return Game.username;
    for (const sn in Game.spawns) {
        const s = Game.spawns[sn];
        if (s.owner && s.owner.username) return s.owner.username;
    }
    return null;
}

module.exports = {
    type: 'reserve',
    priority: taskBase.PRIORITY.RESERVE,
    requirements: { claim: 1 },
    cap: 2,
    canDo: function (creep) {
        return memory.getRole(creep) === 'reserver';
    },
    tasks: function (_room, _snap) {
        const out = [];
        const rr = memory.getRemoteRooms();
        for (const name in rr) {
            const entry = rr[name];
            if (entry.status === 'pending') continue;
            if (entry.status === 'abandoned') continue;
            if (entry.status === 'contested') continue;
            out.push({ target: { id: name, pos: { x: 25, y: 25, roomName: name } } });
        }
        return out;
    },
    score: function (creep, target) {
        return taskBase.approxDistance(creep, target);
    },
    run: function (creep, task, _snap) {
        const roomName = task.target.id;
        const rr = memory.getRemoteRooms();
        const entry = rr[roomName];
        if (!entry || entry.status === 'abandoned' || entry.status === 'contested') return false;

        if (creep.pos.roomName !== roomName) {
            const targetPos = new RoomPosition(25, 25, roomName);
            move.moveCreep(creep, { pos: targetPos }, { visualizePathStyle: { stroke: '#00ffff' } });
            return true;
        }

        const room = Game.rooms[roomName];
        const controller = room ? room.controller : null;
        if (!controller) return false;

        const me = myUsername();
        const reservation = controller.reservation;

        // Enemy reservation: release so the creep can be recycled/re-tasked.
        if (reservation && reservation.username !== me) {
            // Only mark contested if remoteManager hasn't already done so this
            // tick — preserve any existing contested status instead of
            // overwriting it back to "reserved" below.
            entry.status = 'contested';
            const res = creep.attackController(controller);
            if (res === ERR_NOT_IN_RANGE) {
                move.moveCreep(creep, controller, { visualizePathStyle: { stroke: '#ff0000' } });
            }
            return true;
        }

        // Already reserved by us with a healthy timer: just hold position and
        // refresh only when the timer drops low. Don't flip a contested status
        // back to reserved — remoteManager owns that transition.
        if (reservation && reservation.username === me && reservation.ticksToEnd > 500) {
            entry.reservationExpires = Game.time + reservation.ticksToEnd;
            return true;
        }

        if (creep.pos.isNearTo(controller)) {
            const res = creep.reserveController(controller);
            if (res === OK) {
                // Only advance the state machine out of "reserving" — never
                // overwrite "contested".
                if (entry.status === 'reserving') entry.status = 'reserved';
                entry.reservationExpires = Game.time + (controller.reservation ? controller.reservation.ticksToEnd : 0);
                return true;
            }
            if (res === ERR_INVALID_TARGET && controller.level > 0) {
                // Controller is claimed by someone; abort.
                entry.status = 'contested';
                return false;
            }
            return true;
        }
        move.moveCreep(creep, controller, { visualizePathStyle: { stroke: '#00ffff' } });
        return true;
    },
};
