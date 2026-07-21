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

function moveCreep(creep, target, opts) {
    if (!target) return;
    const pos = target.pos || target;
    if (!pos || pos.x === undefined || pos.y === undefined) return;
    if (creep.pos.isNearTo(pos)) {
        memorySchema.setMoveFailures(creep, 0);
        return;
    }
    if (creep.fatigue > 0) return;

    // If both the creep and the target are on roads, use a short path cache
    // so the creep recalculates more often and avoids creating "passing" paths
    // around slower traffic that is actually heading the same way.
    const selfOnRoad = creep.room && creep.room.lookForAt(LOOK_STRUCTURES, creep.pos.x, creep.pos.y).some(function (s) {
        return s.structureType === STRUCTURE_ROAD;
    });
    const targetOnRoad = pos.roomName === creep.pos.roomName &&
        creep.room && creep.room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y).some(function (s) {
        return s.structureType === STRUCTURE_ROAD;
    });
    const roadReuse = (selfOnRoad || targetOnRoad) ? 2 : null;

    const targetId = target.id || (pos.x + ',' + pos.y + ',' + pos.roomName);
    if (memorySchema.getMoveTargetId(creep) !== targetId) {
        memorySchema.setMoveTargetId(creep, targetId);
        memorySchema.setMoveFailures(creep, 0);
        memorySchema.setLastMoveResult(creep, null);
    }

    // Detect stalls when the creep has a target but has not moved for
    // consecutive ticks. Screeps may return OK for queued intents even when
    // physically blocked, so we track position changes ourselves.
    const lastResult = memorySchema.getLastMoveResult(creep);
    if (lastResult !== null) {
        const lastX = creep.memory._lastMoveX;
        const lastY = creep.memory._lastMoveY;
        if (lastX === creep.pos.x && lastY === creep.pos.y) {
            memorySchema.setMoveFailures(creep, memorySchema.getMoveFailures(creep) + 1);
        } else {
            memorySchema.setMoveFailures(creep, 0);
        }
    }
    creep.memory._lastMoveX = creep.pos.x;
    creep.memory._lastMoveY = creep.pos.y;

    const mvr = creep.moveTo(target, Object.assign({
        reusePath: roadReuse !== null ? roadReuse : 5,
        maxOps: 2000,
        ignoreCreeps: false,
        costCallback: function (roomName, matrix) {
            if (roomName !== creep.pos.roomName) return matrix;
            // In 1-tile corridors creeps can deadlock if they all plan around
            // static positions. Only mark creeps that are not immediately behind
            // us (same direction of travel) and are not already adjacent to the
            // target, so head-on traffic gets routed around while following
            // traffic is allowed through.
            const positions = getCreepPositions(roomName);
            const selfX = creep.pos.x;
            const selfY = creep.pos.y;
            const targetX = pos.x;
            const targetY = pos.y;
            for (let i = 0; i < positions.length; i++) {
                const p = positions[i];
                if (p.x === selfX && p.y === selfY) continue;
                const dx = p.x - selfX;
                const dy = p.y - selfY;
                // If a creep is directly behind us it is probably following;
                // don't block it.
                if ((Math.abs(targetX - selfX) > Math.abs(targetY - selfY) && dx !== 0 && (targetX - selfX) * dx > 0) ||
                    (Math.abs(targetY - selfY) >= Math.abs(targetX - selfX) && dy !== 0 && (targetY - selfY) * dy > 0)) {
                    continue;
                }
                const existing = matrix.get(p.x, p.y);
                if (existing === 0) {
                    matrix.set(p.x, p.y, CREEP_COST);
                }
            }
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