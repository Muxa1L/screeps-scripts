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
    const exactTile = !!(opts && opts.exactTile);
    if (exactTile) {
        if (creep.pos.isEqualTo(pos)) {
            memorySchema.setMoveFailures(creep, 0);
            return;
        }
    } else if (creep.pos.isNearTo(pos)) {
        memorySchema.setMoveFailures(creep, 0);
        return;
    }
    if (creep.fatigue > 0) {
        // Update position tracking even during fatigue so the next tick
        // doesn't falsely count a stall — the creep physically can't move
        // when fatigued, so this is not a failure.
        creep.memory._lastMoveX = creep.pos.x;
        creep.memory._lastMoveY = creep.pos.y;
        memorySchema.setLastMoveResult(creep, null);
        return;
    }

    // Stable hauler/miner loops benefit from a longer path cache on roads.
    // Combat/follow paths override this with a caller-provided reusePath when
    // targets change frequently. Cache the lookForAt result per creep per
    // tick (most creeps stay on roads once they enter them, and the
    // self-tile check runs on every moveCreep call).
    if (creep._onRoadTick !== Game.time) {
        creep._onRoadTick = Game.time;
        creep._onRoad = creep.room && creep.room.lookForAt(LOOK_STRUCTURES, creep.pos.x, creep.pos.y).some(function (s) {
            return s.structureType === STRUCTURE_ROAD;
        });
    }
    const selfOnRoad = creep._onRoad;
    const targetOnRoad = pos.roomName === creep.pos.roomName &&
        creep.room && creep.room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y).some(function (s) {
        return s.structureType === STRUCTURE_ROAD;
    });
    const roadReuse = (selfOnRoad || targetOnRoad) ? 5 : null;

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

    // Build the moveTo options directly instead of Object.assign per call.
    // Callers only ever pass `visualizePathStyle` and/or `reusePath` (and
    // `exactTile`, which is consumed inside moveCreep above, not forwarded).
    // A caller-provided reusePath overrides the road-based default.
    const callerReuse = opts && opts.reusePath !== undefined ? opts.reusePath : null;
    const callerIgnoreCreeps = opts && opts.ignoreCreeps !== undefined ? opts.ignoreCreeps : null;
    const moveOpts = {
        reusePath: callerReuse !== null ? callerReuse : (roadReuse !== null ? roadReuse : 10),
        maxOps: 2000,
        ignoreCreeps: callerIgnoreCreeps !== null ? callerIgnoreCreeps : false,
    };
    // Only add creep-avoidance costCallback when ignoreCreeps is false.
    // When ignoreCreeps is true, the caller wants to path THROUGH creeps,
    // so adding 255 to creep tiles would defeat the purpose.
    if (!moveOpts.ignoreCreeps) {
        moveOpts.costCallback = function (roomName, matrix) {
            if (roomName !== creep.pos.roomName) return matrix;
            // Lower the cost of following creeps (behind us) from the
            // default 255 to 10 so the pathfinder can route through them
            // in 1-tile corridors. Head-on creeps keep 255.
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
                // lower its cost so the pathfinder can route through.
                if ((Math.abs(targetX - selfX) > Math.abs(targetY - selfY) && dx !== 0 && (targetX - selfX) * dx < 0) ||
                    (Math.abs(targetY - selfY) >= Math.abs(targetX - selfX) && dy !== 0 && (targetY - selfY) * dy < 0)) {
                    matrix.set(p.x, p.y, 10);
                }
            }
            return matrix;
        };
    }
    if (opts && opts.visualizePathStyle) moveOpts.visualizePathStyle = opts.visualizePathStyle;

    const mvr = creep.moveTo(target, moveOpts);

    memorySchema.setLastMoveResult(creep, mvr);
    // Note: do not reset moveFailures on OK — Screeps returns OK for queued
    // intents even when the creep is physically blocked. The position-based
    // detection above is the sole source of truth for actual movement.
    if (mvr === ERR_NO_PATH) {
        // Retry once with ignoreCreeps=true. In congested base clusters
        // (storage + spawn + extensions packed tightly), the default
        // creep-avoidance costCallback can make all paths appear blocked,
        // returning ERR_NO_PATH even though a path exists through creeps.
        // This is especially common for distributors trying to reach
        // storage surrounded by other creeps. The retry lets the pathfinder
        // ignore creep positions and find a structural path.
        const retryOpts = { reusePath: 2, maxOps: 2000, ignoreCreeps: true };
        if (opts && opts.visualizePathStyle) retryOpts.visualizePathStyle = opts.visualizePathStyle;
        const mvr2 = creep.moveTo(target, retryOpts);
        memorySchema.setLastMoveResult(creep, mvr2);
        if (mvr2 === ERR_NO_PATH) {
            memorySchema.setMoveFailures(creep, memorySchema.getMoveFailures(creep) + 1);
        }
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