var logger = require('logger');
var taskBase = require('taskBase');

var CREEP_COST = 0xff;
var CREEP_NEXT_COST = 0x80;

function markCreeps(matrix, roomName, self) {
    var room = Game.rooms[roomName];
    if (!room) return;
    var creeps = room.find(FIND_CREEPS);
    for (var i = 0; i < creeps.length; i++) {
        var c = creeps[i];
        if (c === self) continue;
        if (!c.my) continue;
        var existing = matrix.get(c.pos.x, c.pos.y);
        if (existing === 0 || existing === undefined) {
            matrix.set(c.pos.x, c.pos.y, CREEP_COST);
        }
        var nextDir = c.memory._nextDir;
        if (nextDir !== undefined) {
            var dx = [0, 0, 1, 1, 1, 0, -1, -1, -1][nextDir];
            var dy = [-1, 1, -1, 0, 1, 0, 1, -1, 0][nextDir];
            if (dx !== undefined) {
                var nx = c.pos.x + dx;
                var ny = c.pos.y + dy;
                if (nx >= 0 && nx <= 49 && ny >= 0 && ny <= 49) {
                    var nextExisting = matrix.get(nx, ny);
                    if (nextExisting === 0 || nextExisting === undefined) {
                        matrix.set(nx, ny, CREEP_NEXT_COST);
                    }
                }
            }
        }
    }
}

function moveCreep(creep, target, opts) {
    if (!target) return;
    if (!target.pos) return;
    if (creep.pos.isNearTo(target)) return;
    if (creep.fatigue > 0) return;

    var mvr = creep.moveTo(target, Object.assign({
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
    if (mvr === OK || mvr === ERR_TIRED || mvr === ERR_BUSY) return;
    if (Memory.flags && Memory.flags.debugStuck) {
        console.log('[stuck] ' + creep.name + ' moveTo ' + target.id + ' -> ' + mvr);
    }
}

function action(creep, verb) {
    if (creep && logger && logger.setAction) logger.setAction(creep, verb);
}

module.exports = {
    moveCreep: moveCreep,
    action: action,
    taskBase: taskBase,
};


