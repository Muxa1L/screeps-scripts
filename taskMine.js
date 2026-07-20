var TaskType = require('taskBaseClass');
var taskBase = require('taskBase');
var move = require('moveUtil');
var sourceRegistry = require('sourceRegistry');

module.exports = new TaskType({
    type: 'mine',
    priority: taskBase.PRIORITY.MINE,
    cap: 4,
    canDo: function (creep) {
        return creep.getActiveBodyparts(WORK) > 0 && creep.getActiveBodyparts(CARRY) === 0;
    },
    tasks: function (room, snap) {
        if (!Memory.sources) return [];
        var out = [];
        for (var id in Memory.sources) {
            if (Memory.sources[id].roomName !== room.name) continue;
            out.push({ target: { id: id, pos: { x: Memory.sources[id].x, y: Memory.sources[id].y, roomName: room.name } } });
        }
        return out;
    },
    run: function (creep, task) {
        var sourceId = task.target.id;
        if (!creep.memory.sourceId) {
            creep.memory.sourceId = sourceId;
            if (!sourceRegistry.claimSlot(sourceId, creep.name)) {
                creep.memory.sourceId = null;
                return false;
            }
        } else if (creep.memory.sourceId !== sourceId) {
            sourceRegistry.releaseClaim(creep.name);
            creep.memory.sourceId = sourceId;
            if (!sourceRegistry.claimSlot(sourceId, creep.name)) {
                creep.memory.sourceId = null;
                return false;
            }
        }
        var slot = sourceRegistry.slotPos(sourceId, creep.name);
        if (slot && !creep.pos.isEqualTo(slot)) {
            move.action(creep, 'moving->mine@' + sourceId);
            move.moveCreep(creep, slot, { visualizePathStyle: { stroke: '#ffaa00' } });
            return true;
        }
        var source = Game.getObjectById(sourceId);
        if (!source) {
            sourceRegistry.releaseClaim(creep.name);
            creep.memory.sourceId = null;
            return false;
        }
        var ret = creep.harvest(source);
        if (ret === OK) {
            move.action(creep, 'harvesting@' + sourceId);
            return true;
        }
        if (ret === ERR_NOT_IN_RANGE) {
            move.moveCreep(creep, source, { visualizePathStyle: { stroke: '#ffaa00' } });
        }
        return true;
    },
});
