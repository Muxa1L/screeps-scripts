const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');
const memory = require('../../utils/memorySchema');

module.exports = {
    type: 'claim',
    priority: taskBase.PRIORITY.CLAIM,
    requirements: { claim: 1 },
    cap: 1,
    canDo: function (creep) {
        return memory.getRole(creep) === 'claimer' && creep.getActiveBodyparts(CLAIM) > 0;
    },
    tasks: function (_room, _snap) {
        const out = [];
        const exp = memory.getExpansion();
        if (exp && exp.target && exp.target.roomName) {
            const roomName = exp.target.roomName;
            out.push({ target: { id: roomName, pos: { x: 25, y: 25, roomName: roomName } } });
        }
        return out;
    },
    score: function (creep, target) {
        return taskBase.approxDistance(creep, target);
    },
    run: function (creep, task, _snap) {
        const roomName = task.target.id;
        const exp = memory.getExpansion();
        if (!exp || !exp.target || exp.target.roomName !== roomName) return false;

        // Pre-flight: if the target room is visible and has hostiles, abort
        // BEFORE entering. Entering and then retreating is too late — the
        // claimer dies at the room border before the hostile check fires.
        var targetRoom = Game.rooms[roomName];
        if (targetRoom && targetRoom.find && targetRoom.find(FIND_HOSTILE_CREEPS).length > 0) {
            memory.addExpansionHistory({ roomName: roomName, claimedTick: null, abandonedTick: Game.time, reason: 'hostiles-visible' });
            delete exp.target;
            memory.clearRoomBootstrapping(roomName);
            var home0 = memory.getHomeRoom(creep) || creep.pos.roomName;
            var spawnUtil0 = require('../../utils/spawnUtil');
            var spawn0 = spawnUtil0.nearestSpawnInRoom(creep, home0);
            if (spawn0 && !creep.pos.isNearTo(spawn0)) {
                move.moveCreep(creep, spawn0, { visualizePathStyle: { stroke: '#888888' } });
            } else if (spawn0) {
                spawn0.recycleCreep(creep);
            }
            return false;
        }

        if (creep.pos.roomName !== roomName) {
            // If damaged while transiting, hostiles are attacking — retreat.
            if (creep.hits < creep.hitsMax) {
                memory.addExpansionHistory({ roomName: roomName, claimedTick: null, abandonedTick: Game.time, reason: 'attacked-in-transit' });
                delete exp.target;
                memory.clearRoomBootstrapping(roomName);
                var homeR = memory.getHomeRoom(creep) || creep.pos.roomName;
                var spawnR = require('../../utils/spawnUtil').nearestSpawnInRoom(creep, homeR);
                if (spawnR) {
                    creep.moveTo(spawnR, { reusePath: 5, visualizePathStyle: { stroke: '#ff0000' } });
                    if (creep.pos.isNearTo(spawnR)) spawnR.recycleCreep(creep);
                }
                return false;
            }
            // Cross-room movement — ignore creeps so the claimer doesn't get
            // stuck behind friendly creeps clustering near the spawn.
            creep.moveTo(new RoomPosition(25, 25, roomName), { reusePath: 10, ignoreCreeps: true, visualizePathStyle: { stroke: '#ff00ff' } });
            return true;
        }

        const room = Game.rooms[roomName];
        const controller = room ? room.controller : null;
        if (!controller) return false;

        // Abort if the room is dangerous: hostiles present.
        if (room.find && room.find(FIND_HOSTILE_CREEPS).length > 0) {
            memory.addExpansionHistory({ roomName: roomName, claimedTick: null, abandonedTick: Game.time, reason: 'hostiles-present' });
            delete exp.target;
            memory.clearRoomBootstrapping(roomName);
            const home = memory.getHomeRoom(creep) || creep.pos.roomName;
            const spawnUtil = require('../../utils/spawnUtil');
            const spawn = spawnUtil.nearestSpawnInRoom(creep, home);
            if (spawn && !creep.pos.isNearTo(spawn)) {
                move.moveCreep(creep, spawn, { visualizePathStyle: { stroke: '#888888' } });
            } else if (spawn) {
                spawn.recycleCreep(creep);
            }
            return false;
        }

        // Already ours: target was claimed successfully (perhaps by a
        // previous claimer). Clear the target and recycle this creep.
        if (controller.my) {
            if (exp.target) {
                exp.target.claimedTick = Game.time;
                memory.setRoomBootstrapping(roomName, memory.getHomeRoom(creep));
            }
            delete exp.target;
            const home = memory.getHomeRoom(creep) || creep.pos.roomName;
            const spawnUtil = require('../../utils/spawnUtil');
            const spawn = spawnUtil.nearestSpawnInRoom(creep, home);
            if (spawn && !creep.pos.isNearTo(spawn)) {
                move.moveCreep(creep, spawn, { visualizePathStyle: { stroke: '#888888' } });
            } else if (spawn) {
                spawn.recycleCreep(creep);
            }
            return false;
        }

        // Enemy-claimed: clear the target and recycle. bootstrapManager will
        // also detect this, but we short-circuit here to avoid wasting ticks.
        if (controller.owner && !controller.my) {
            memory.addExpansionHistory({ roomName: roomName, claimedTick: null, abandonedTick: Game.time, reason: 'enemy-claimed' });
            delete exp.target;
            memory.clearRoomBootstrapping(roomName);
            // Walk to nearest home spawn for recycle.
            const home = memory.getHomeRoom(creep) || creep.pos.roomName;
            const spawnUtil = require('../../utils/spawnUtil');
            const spawn = spawnUtil.nearestSpawnInRoom(creep, home);
            if (spawn && !creep.pos.isNearTo(spawn)) {
                move.moveCreep(creep, spawn, { visualizePathStyle: { stroke: '#888888' } });
            } else if (spawn) {
                spawn.recycleCreep(creep);
            }
            return false;
        }

        if (creep.pos.isNearTo(controller)) {
            const res = creep.claimController(controller);
            if (res === OK && controller.my) {
                // Successfully claimed.
                exp.target.claimedTick = Game.time;
                memory.setRoomBootstrapping(roomName, memory.getHomeRoom(creep));
                // Recycle the claimer; its job is done.
                const home = memory.getHomeRoom(creep) || creep.pos.roomName;
                const spawnUtil = require('../../utils/spawnUtil');
                const spawn = spawnUtil.nearestSpawnInRoom(creep, home);
                if (spawn) spawn.recycleCreep(creep);
                return false;
            }
            if (res === ERR_INVALID_TARGET) {
                memory.addExpansionHistory({ roomName: roomName, claimedTick: null, abandonedTick: Game.time, reason: 'invalid-target' });
                delete exp.target;
                return false;
            }
            // ERR_NOT_IN_RANGE / other; keep trying.
            return true;
        }
        move.moveCreep(creep, controller, { visualizePathStyle: { stroke: '#ff00ff' } });
        return true;
    },
};