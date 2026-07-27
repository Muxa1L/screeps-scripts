const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');
const memory = require('../../utils/memorySchema');
const depositService = require('../../services/depositService');
const routeCache = require('../../utils/routeCache');

module.exports = {
    type: 'remoteHaul',
    priority: taskBase.PRIORITY.REMOTE_HAUL,
    requirements: { carry: 1 },
    cap: 4,
    canDo: function (creep) {
        return memory.getRole(creep) === 'remoteHauler';
    },
    tasks: function (_room, snap) {
        const out = [];
        const rr = memory.getRemoteRooms();
        for (const name in rr) {
            const entry = rr[name];
            if (entry.status !== 'active' && entry.status !== 'reserved' && entry.status !== 'building') continue;
            out.push({ target: { id: name, pos: { x: 25, y: 25, roomName: name } } });
        }
        return out;
    },
    score: function (creep, target) {
        return taskBase.approxDistance(creep, target);
    },
    run: function (creep, task, snap) {
        const roomName = task.target.id;
        const homeRoom = memory.getHomeRoom(creep) || creep.memory.homeRoom || creep.pos.roomName;
        const energy = creep.store[RESOURCE_ENERGY] || 0;

        // Return home to deposit.
        if (energy > 0 && creep.pos.roomName === homeRoom) {
            const deposit = depositService.findDeposit(creep, snap, {});
            if (deposit) {
                const still = depositService.transferTo(creep, deposit, RESOURCE_ENERGY);
                if (!still) return false;
                return true;
            }
            return true;
        }

        // Go collect from remote containers when empty.
        if (energy === 0) {
            if (creep.pos.roomName !== roomName) {
                const step = routeCache.getNextStep(homeRoom, roomName, creep.pos.roomName);
                if (step) {
                    const exitPos = creep.pos.findClosestByPath(step.exit);
                    if (exitPos) move.moveCreep(creep, exitPos, { visualizePathStyle: { stroke: '#ffffaa' } });
                } else {
                    move.moveCreep(creep, { pos: { x: 25, y: 25, roomName: roomName } }, { visualizePathStyle: { stroke: '#ffffaa' } });
                }
                return true;
            }
            const room = Game.rooms[roomName];
            if (!room) return true;
            const containers = room.find(FIND_STRUCTURES, {
                filter: function (s) {
                    return s.structureType === STRUCTURE_CONTAINER && (s.store[RESOURCE_ENERGY] || 0) >= 100;
                },
            });
            if (containers.length === 0) return true;
            const target = creep.pos.findClosestByPath(containers);
            if (target) {
                const wRes = creep.withdraw(target, RESOURCE_ENERGY);
                if (wRes === ERR_NOT_IN_RANGE) {
                    move.moveCreep(creep, target, { visualizePathStyle: { stroke: '#ffffaa' } });
                }
                return true;
            }
            return true;
        }

        // Energy loaded and not home: path home via cached route.
        const step = routeCache.getNextStep(roomName, homeRoom, creep.pos.roomName);
        if (step) {
            const exitPos = creep.pos.findClosestByPath(step.exit);
            if (exitPos) move.moveCreep(creep, exitPos, { visualizePathStyle: { stroke: '#ffffaa' } });
        } else {
            move.moveCreep(creep, { pos: { x: 25, y: 25, roomName: homeRoom } }, { visualizePathStyle: { stroke: '#ffffaa' } });
        }
        return true;
    },
};
