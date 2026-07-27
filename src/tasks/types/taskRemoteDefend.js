const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');
const memory = require('../../utils/memorySchema');

module.exports = {
    type: 'remoteDefend',
    priority: taskBase.PRIORITY.REMOTE_DEFEND,
    requirements: { attack: 1 },
    cap: 4,
    canDo: function (creep) {
        return creep.getActiveBodyparts(ATTACK) > 0 || creep.getActiveBodyparts(RANGED_ATTACK) > 0;
    },
    tasks: function (_room, snap) {
        const out = [];
        const rr = memory.getRemoteRooms();
        for (const name in rr) {
            const entry = rr[name];
            if (entry.status !== 'contested') continue;
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
        if (!entry || entry.status !== 'contested') return false;

        // Retreat if low bucket to avoid burning CPU on expensive fights.
        if (Game.cpu.bucket < 5000) {
            const home = memory.getHomeRoom(creep) || creep.pos.roomName;
            if (creep.pos.roomName !== home) {
                move.moveCreep(creep, { pos: { x: 25, y: 25, roomName: home } }, { visualizePathStyle: { stroke: '#ff0000' } });
            }
            return true;
        }

        if (creep.pos.roomName !== roomName) {
            move.moveCreep(creep, { pos: { x: 25, y: 25, roomName: roomName } }, { visualizePathStyle: { stroke: '#ff0000' } });
            return true;
        }

        const enemy = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if (!enemy) return true;
        const attackParts = creep.getActiveBodyparts(ATTACK);
        if (attackParts > 0) {
            const res = creep.attack(enemy);
            if (res === ERR_NOT_IN_RANGE) move.moveCreep(creep, enemy, { visualizePathStyle: { stroke: '#ff0000' } });
        } else {
            const res = creep.rangedAttack(enemy);
            if (res === ERR_NOT_IN_RANGE) move.moveCreep(creep, enemy, { visualizePathStyle: { stroke: '#ff0000' } });
        }
        return true;
    },
};
