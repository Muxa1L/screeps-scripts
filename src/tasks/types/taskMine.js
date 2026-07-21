const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');
const sourceRegistry = require('../../economy/sourceRegistry');
const memory = require('../../utils/memorySchema');

module.exports = {
    type: 'mine',
    priority: taskBase.PRIORITY.MINE,
    requirements: { work: 1 },
    cap: 4,
    canDo: function (creep) {
        return creep.getActiveBodyparts(WORK) > 0 && creep.getActiveBodyparts(CARRY) === 0;
    },
    tasks: function (room, _snap) {
        if (!Memory.sources) return [];
        const out = [];
        for (const id in Memory.sources) {
            if (Memory.sources[id].roomName !== room.name) continue;
            const source = Game.getObjectById(id);
            if (!source) continue;
            out.push({ target: { id: id, pos: { x: Memory.sources[id].x, y: Memory.sources[id].y, roomName: room.name } } });
        }
        return out;
    },
    score: function (creep, target) {
        const dist = taskBase.approxDistance(creep, target);
        const source = Game.getObjectById(target.id);
        // Strongly prefer active sources so miners harvest when energy is available,
        // but still consider empty ones so they position on their slot while
        // regenerating instead of bunching at spawn with no task.
        return dist + (source && source.energy > 0 ? 0 : 100);
    },
    run: function (creep, task, _snap) {
        const sourceId = task.target.id;
        const currentSource = memory.getSourceId(creep);
        if (currentSource !== sourceId) {
            if (currentSource) sourceRegistry.releaseClaim(creep.name);
            memory.setSourceId(creep, sourceId);
        }

        // Ensure we have a slot. If all slots are taken, release the task so
        // the creep doesn't wander onto another miner's tile.
        if (!sourceRegistry.claimSlot(sourceId, creep.name)) {
            sourceRegistry.releaseClaim(creep.name);
            memory.clearSourceId(creep);
            return false;
        }

        const source = Game.getObjectById(sourceId);
        if (!source) {
            sourceRegistry.releaseClaim(creep.name);
            memory.clearSourceId(creep);
            return false;
        }

        const slot = sourceRegistry.slotPos(sourceId, creep.name);
        if (slot && (creep.pos.x !== slot.x || creep.pos.y !== slot.y)) {
            // Not on our assigned slot; move there instead of harvesting from
            // a tile that may belong to another miner.
            move.action(creep, 'moving->mine@' + sourceId);
            move.moveCreep(creep, slot, { visualizePathStyle: { stroke: '#ffaa00' } });
            return true;
        }

        if (creep.pos.isNearTo(source)) {
            const ret = creep.harvest(source);
            if (ret === OK) {
                move.action(creep, 'harvesting@' + sourceId);
                return true;
            }
            // Source depleted or busy; stay put and wait.
            return true;
        }

        // No slot assigned; approach the source directly.
        move.action(creep, 'moving->mine@' + sourceId);
        move.moveCreep(creep, source, { visualizePathStyle: { stroke: '#ffaa00' } });
        return true;
    },
};
