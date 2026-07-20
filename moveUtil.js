const logger = require('logger');


const CREEP_COST = 0xff;
const MOVE_FAIL_THRESHOLD = 5;

function markCreeps(matrix, roomName, self) {
    const room = Game.rooms[roomName];
    if (!room) return;
    const creeps = room.find(FIND_CREEPS);
    for (let i = 0; i < creeps.length; i++) {
        const c = creeps[i];
        if (c === self) continue;
        if (!c.my) continue;
        const existing = matrix.get(c.pos.x, c.pos.y);
        if (existing === 0 || existing === undefined) {
            matrix.set(c.pos.x, c.pos.y, CREEP_COST);
        }
    }
}

function moveCreep(creep, target, opts) {
    if (!target) return;
    if (!target.pos) return;
    if (creep.pos.isNearTo(target)) return;
    if (creep.fatigue > 0) return;

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

    creep.memory._lastMoveResult = mvr;
    if (mvr === ERR_NO_PATH) {
        creep.memory._moveFailures = (creep.memory._moveFailures || 0) + 1;
    } else if (mvr === OK || mvr === ERR_TIRED || mvr === ERR_BUSY) {
        creep.memory._moveFailures = 0;
    } else {
        if (Memory.flags && Memory.flags.debugStuck) {
            console.log('[stuck] ' + creep.name + ' moveTo ' + (target.id || '?') + ' -> ' + mvr);
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