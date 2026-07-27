const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');
const memory = require('../../utils/memorySchema');

module.exports = {
    type: 'bootstrap',
    priority: taskBase.PRIORITY.BOOTSTRAP,
    requirements: { work: 1, carry: 1 },
    cap: 4,
    canDo: function (creep) {
        return memory.getRole(creep) === 'bootstrapper';
    },
    tasks: function (_room, _snap) {
        const out = [];
        // Emit a task per bootstrapping room. Bootstrappers claim the room via
        // bootstrapRoom memory and commute from the home spawn.
        if (!Memory.rooms) return out;
        for (const name in Memory.rooms) {
            const m = Memory.rooms[name];
            if (!m || !m.bootstrapping) continue;
            out.push({ target: { id: name, pos: { x: 25, y: 25, roomName: name } } });
        }
        return out;
    },
    score: function (creep, target) {
        return taskBase.approxDistance(creep, target);
    },
    run: function (creep, task, _snap) {
        const roomName = task.target.id;

        if (creep.pos.roomName !== roomName) {
            move.moveCreep(creep, { pos: { x: 25, y: 25, roomName: roomName } }, { visualizePathStyle: { stroke: '#ffaa00' } });
            return true;
        }

        const room = Game.rooms[roomName];
        if (!room) return true;

        // If a spawn exists and RCL >= 2, transition to harvester and let the
        // normal spawnManager take over the new room.
        const controller = room.controller;
        const spawns = room.find(FIND_MY_SPAWNS);
        if (spawns && spawns.length > 0 && controller && controller.my && controller.level >= 2) {
            memory.clearRoomBootstrapping(roomName);
            memory.clearBootstrapRoom(creep);
            memory.setRole(creep, 'harvester');
            // Re-home the bootstrapper to the new room so it counts against
            // the new room's spawn quota going forward.
            memory.setHomeRoom(creep, roomName);
            const exp = memory.getExpansion();
            if (exp && exp.target && exp.target.roomName === roomName) delete exp.target;
            return false;
        }

        // Build queued construction sites (spawn first, then extensions, then roads).
        if (creep.store[RESOURCE_ENERGY] > 0) {
            const sites = room.find(FIND_CONSTRUCTION_SITES);
            if (sites.length > 0) {
                sites.sort(function (a, b) {
                    const aSpawn = a.structureType === STRUCTURE_SPAWN ? 0 : 1;
                    const bSpawn = b.structureType === STRUCTURE_SPAWN ? 0 : 1;
                    return aSpawn - bSpawn || creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b);
                });
                const site = sites[0];
                const res = creep.build(site);
                if (res === ERR_NOT_IN_RANGE) {
                    move.moveCreep(creep, site, { visualizePathStyle: { stroke: '#00ffff' } });
                }
                return true;
            }
            // Nothing to build; deposit into the spawn if present, else upgrade.
            if (spawns && spawns.length > 0) {
                const spawn = spawns[0];
                if (creep.pos.isNearTo(spawn) && (spawn.store.getFreeCapacity(RESOURCE_ENERGY) || 0) > 0) {
                    creep.transfer(spawn, RESOURCE_ENERGY);
                    return true;
                }
                if (!creep.pos.isNearTo(spawn)) {
                    move.moveCreep(creep, spawn, { visualizePathStyle: { stroke: '#ffaa00' } });
                    return true;
                }
            }
            if (controller && creep.pos.isNearTo(controller)) {
                creep.upgradeController(controller);
                return true;
            }
            if (controller) {
                move.moveCreep(creep, controller, { visualizePathStyle: { stroke: '#ffaa00' } });
                return true;
            }
            return true;
        }

        // Empty: harvest from the local source.
        const sources = room.find(FIND_SOURCES_ACTIVE);
        if (sources.length === 0) return true;
        const source = creep.pos.findClosestByPath(sources);
        if (!source) return true;
        const res = creep.harvest(source);
        if (res === ERR_NOT_IN_RANGE) {
            move.moveCreep(creep, source, { visualizePathStyle: { stroke: '#ffaa00' } });
        }
        return true;
    },
};