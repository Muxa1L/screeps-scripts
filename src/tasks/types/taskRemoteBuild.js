const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');
const memory = require('../../utils/memorySchema');

module.exports = {
    type: 'remoteBuild',
    priority: taskBase.PRIORITY.REMOTE_BUILD,
    requirements: { work: 1, carry: 1 },
    cap: 2,
    canDo: function (creep) {
        return memory.getRole(creep) === 'remoteBuilder';
    },
    tasks: function (_room, snap) {
        const out = [];
        const rr = memory.getRemoteRooms();
        for (const name in rr) {
            const entry = rr[name];
            if ((entry.containerSiteIds || []).length === 0 && (entry.roadSiteIds || []).length === 0) continue;
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
        if (!entry) return false;

        if (creep.pos.roomName !== roomName) {
            move.moveCreep(creep, { pos: { x: 25, y: 25, roomName: roomName } }, { visualizePathStyle: { stroke: '#00ffff' } });
            return true;
        }

        if (creep.store[RESOURCE_ENERGY] === 0) {
            const source = creep.pos.findClosestByPath(FIND_SOURCES);
            if (source) {
                const res = creep.harvest(source);
                if (res === ERR_NOT_IN_RANGE) move.moveCreep(creep, source, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
            return true;
        }

        const room = Game.rooms[roomName];
        if (!room) return true;
        const sites = room.find(FIND_CONSTRUCTION_SITES);
        if (sites.length === 0) {
            // No sites left; recycle.
            entry.containerSiteIds = [];
            entry.roadSiteIds = [];
            return false;
        }
        sites.sort(function (a, b) {
            const aContainer = a.structureType === STRUCTURE_CONTAINER ? 0 : 1;
            const bContainer = b.structureType === STRUCTURE_CONTAINER ? 0 : 1;
            return aContainer - bContainer || creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b);
        });
        const target = sites[0];
        const res = creep.build(target);
        if (res === ERR_NOT_IN_RANGE) move.moveCreep(creep, target, { visualizePathStyle: { stroke: '#00ffff' } });
        return true;
    },
};
