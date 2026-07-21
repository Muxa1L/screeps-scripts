const TaskType = require('taskBaseClass');
const taskBase = require('taskBase');
const move = require('moveUtil');
const sourceRegistry = require('sourceRegistry');

module.exports = new TaskType({
    type: 'mine',
    priority: taskBase.PRIORITY.MINE,
    cap: 4,
    canDo: function (creep) {
        return creep.getActiveBodyparts(WORK) > 0 && creep.getActiveBodyparts(CARRY) === 0;
    },
    tasks: function (room, _snap) {
        if (!Memory.sources) return [];
        const out = [];
        for (const id in Memory.sources) {
            if (Memory.sources[id].roomName !== room.name) continue;
            out.push({ target: { id: id, pos: { x: Memory.sources[id].x, y: Memory.sources[id].y, roomName: room.name } } });
        }
        return out;
    },
    run: function (creep, task) {
        const sourceId = task.target.id;
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
        const slot = sourceRegistry.slotPos(sourceId, creep.name);
        if (slot && !creep.pos.isEqualTo(slot)) {
            move.action(creep, 'moving->mine@' + sourceId);
            move.moveCreep(creep, slot, { visualizePathStyle: { stroke: '#ffaa00' } });
            return true;
        }
        const source = Game.getObjectById(sourceId);
        if (!source) {
            sourceRegistry.releaseClaim(creep.name);
            creep.memory.sourceId = null;
            return false;
        }
        const ret = creep.harvest(source);
        if (ret === OK) {
            move.action(creep, 'harvesting@' + sourceId);
            return true;
        }
        if (ret === ERR_NOT_IN_RANGE) {
            move.moveCreep(creep, slot || source, { visualizePathStyle: { stroke: '#ffaa00' } });
        }
        return true;
    },
});
