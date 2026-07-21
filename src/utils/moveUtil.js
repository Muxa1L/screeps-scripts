const constants = require('../config/constants');
const memorySchema = require('./memorySchema');
const logger = require('./logger');

const CREEP_COST = 0xff;
const MOVE_FAIL_THRESHOLD = constants.MOVE_FAIL_THRESHOLD;

let _creepPositionsByRoom = {};
let _creepPositionsTick = -1;

function getCreepPositions(roomName) {
    if (_creepPositionsTick !== Game.time) {
        _creepPositionsTick = Game.time;
        _creepPositionsByRoom = {};
    }
    if (_creepPositionsByRoom[roomName]) return _creepPositionsByRoom[roomName];
    const room = Game.rooms[roomName];
    if (!room) {
        _creepPositionsByRoom[roomName] = [];
        return [];
    }
    const creeps = room.find(FIND_CREEPS);
    const positions = [];
    for (let i = 0; i < creeps.length; i++) {
        positions.push({ x: creeps[i].pos.x, y: creeps[i].pos.y });
    }
    _creepPositionsByRoom[roomName] = positions;
    return positions;
}

function markCreeps(matrix, roomName, self) {
    const positions = getCreepPositions(roomName);
    const selfX = self ? self.pos.x : -1;
    const selfY = self ? self.pos.y : -1;
    for (let i = 0; i < positions.length; i++) {
        const p = positions[i];
        if (p.x === selfX && p.y === selfY) continue;
        const existing = matrix.get(p.x, p.y);
        if (existing === 0) {
            matrix.set(p.x, p.y, CREEP_COST);
        }
    }
}

function moveCreep(creep, target, opts) {
    if (!target) return;
    if (!target.pos) return;
    if (creep.pos.isNearTo(target)) {
        memorySchema.setMoveFailures(creep, 0);
        return;
    }
    if (creep.fatigue > 0) return;

    const targetId = target.id || (target.pos.x + ',' + target.pos.y + ',' + target.pos.roomName);
    if (memorySchema.getMoveTargetId(creep) !== targetId) {
        memorySchema.setMoveTargetId(creep, targetId);
        memorySchema.setMoveFailures(creep, 0);
    }

    const mvr = creep.moveTo(target, Object.assign({
        reusePath: 5,
        maxOps: 2000,
        ignoreCreeps: false,
        costCallback: function (roomName, matrix) {
            if (roomName !== creep.pos.roomName) return matrix;
            markCreeps(matrix, roomName, creep);
            return matrix;
        },
    }, opts || {}));

    memorySchema.setLastMoveResult(creep, mvr);
    if (mvr === OK) {
        memorySchema.setMoveFailures(creep, 0);
    } else if (mvr === ERR_NO_PATH) {
        memorySchema.setMoveFailures(creep, memorySchema.getMoveFailures(creep) + 1);
    } else if (mvr === ERR_TIRED || mvr === ERR_BUSY) {
        // transient, keep current count
    } else {
        if (Memory.flags && Memory.flags.debugStuck) {
            console.log('[stuck] ' + creep.name + ' moveTo ' + targetId + ' -> ' + mvr);
        }
    }
}

function action(creep, verb) {
    if (creep && logger && logger.setAction) logger.setAction(creep, verb);
}

module.exports = {
    moveCreep: moveCreep,
    action: action,
    MOVE_FAIL_THRESHOLD: MOVE_FAIL_THRESHOLD,
};