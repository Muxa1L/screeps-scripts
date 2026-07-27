const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');
const sourceRegistry = require('../../economy/sourceRegistry');
const memory = require('../../utils/memorySchema');
const remoteManager = require('../../managers/remoteManager');
const spawnUtil = require('../../utils/spawnUtil');

module.exports = {
    type: 'scout',
    priority: taskBase.PRIORITY.SCOUT,
    requirements: { move: 1 },
    cap: 2,
    canDo: function (creep) {
        return memory.getRole(creep) === 'scout';
    },
    tasks: function (_room, _snap) {
        const out = [];
        const rr = memory.getRemoteRooms();
        for (const name in rr) {
            const entry = rr[name];
            if (entry.status !== 'pending') continue;
            // Only dispatch a scout when the remote-mining prerequisites for
            // this room are met (distance, RCL, storage, cap). The
            // remoteManager has already created the entry from the flag.
            if (!remoteManager.canActivate(name)) continue;
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
        if (!rr[roomName]) return false;

        // Arrived in the target room.
        if (creep.pos.roomName === roomName) {
            rr[roomName].status = 'scouted';
            rr[roomName].scoutedTick = Game.time;
            const room = Game.rooms[roomName];
            if (room) {
                const sources = room.find(FIND_SOURCES);
                rr[roomName].sourceIds = [];
                for (let i = 0; i < sources.length; i++) {
                    sourceRegistry.registerRemoteSource(room, sources[i]);
                    rr[roomName].sourceIds.push(sources[i].id);
                }
                const controller = room.controller;
                if (controller) rr[roomName].controllerId = controller.id;
            }
            // Scout is done; recycle at the nearest spawn in the home room,
            // not an arbitrary spawn in iteration order.
            const homeRoom = memory.getHomeRoom(creep) || creep.memory.homeRoom;
            const spawn = homeRoom ? spawnUtil.nearestSpawnInRoom(creep, homeRoom) : null;
            if (spawn && !creep.pos.isNearTo(spawn)) {
                move.moveCreep(creep, spawn, { visualizePathStyle: { stroke: '#888888' } });
            } else if (spawn) {
                spawn.recycleCreep(creep);
            }
            return false;
        }

        // Move toward the room via the controller position.
        const targetPos = new RoomPosition(25, 25, roomName);
        move.moveCreep(creep, { pos: targetPos }, { visualizePathStyle: { stroke: '#00ffff' } });
        return true;
    },
};
