const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');
const memory = require('../../utils/memorySchema');

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
        if (!entry || entry.status === 'abandoned') return false;

        if (creep.pos.roomName !== roomName) {
            const targetPos = new RoomPosition(25, 25, roomName);
            move.moveCreep(creep, { pos: targetPos }, { visualizePathStyle: { stroke: '#00ffff' } });
            return true;
        }

        const room = Game.rooms[roomName];
        const controller = room ? room.controller : null;
        if (!controller) return false;

        // Enemy reservation: release so the creep can be recycled/re-tasked.
        if (controller.reservation && controller.reservation.username !== (Game.spawns[Object.keys(Game.spawns)[0]] || {}).owner) {
            entry.status = 'contested';
            return false;
        }

        if (creep.pos.isNearTo(controller)) {
            if (!controller.my && controller.reservation && controller.reservation.username) {
                // Already reserved by us.
            }
            const res = creep.reserveController(controller);
            if (res === OK) {
                entry.status = 'reserved';
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
