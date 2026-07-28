const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');
const sourceRegistry = require('../../economy/sourceRegistry');
const memory = require('../../utils/memorySchema');

module.exports = {
    type: 'remoteMine',
    priority: taskBase.PRIORITY.REMOTE_MINE,
    requirements: { work: 1 },
    cap: 2,
    canDo: function (creep) {
        return memory.getRole(creep) === 'remoteMiner';
    },
    tasks: function (_room, snap) {
        const out = [];
        if (!Memory.sources) return out;
        for (const id in Memory.sources) {
            const src = Memory.sources[id];
            if (!src.remote) continue;
            const source = Game.getObjectById(id);
            if (!source) continue;
            out.push({ target: { id: id, pos: { x: src.x, y: src.y, roomName: src.roomName } } });
        }
        return out;
    },
    score: function (creep, target) {
        return taskBase.approxDistance(creep, target);
    },
    run: function (creep, task, snap) {
        const sourceId = task.target.id;
        const source = Game.getObjectById(sourceId);
        if (!source) return false;
        const memSrc = Memory.sources[sourceId];
        if (!memSrc || !memSrc.remote) return false;

        if (creep.pos.roomName !== source.pos.roomName) {
            move.moveCreep(creep, { pos: { x: 25, y: 25, roomName: source.pos.roomName } }, { visualizePathStyle: { stroke: '#ffaa00' } });
            return true;
        }

        if (!sourceRegistry.claimSlot(sourceId, creep.name)) {
            sourceRegistry.releaseClaim(creep.name);
            // Don't return false — that blacklists the task for 5 ticks and,
            // if no alternative remote mine task is available, leaves the
            // miner idling. Return true so the scheduler re-evaluates next
            // tick and picks up a freshly-freed slot immediately.
            return true;
        }

        const slot = sourceRegistry.slotPos(sourceId, creep.name);
        if (slot && !creep.pos.isEqualTo(slot)) {
            move.moveCreep(creep, slot, { visualizePathStyle: { stroke: '#ffaa00' }, exactTile: true });
            return true;
        }

        if (creep.pos.isNearTo(source)) {
            const carried = creep.store[RESOURCE_ENERGY] || 0;
            if (carried > 0 && (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0 || source.energy === 0)) {
                const deposit = adjacentDeposit(creep, snap);
                if (deposit) {
                    creep.transfer(deposit, RESOURCE_ENERGY);
                    move.action(creep, 'remote-mine->store@' + deposit.id);
                    return true;
                }
                creep.drop(RESOURCE_ENERGY);
                move.action(creep, 'remote-mine->drop@' + sourceId);
                return true;
            }
            creep.harvest(source);
            move.action(creep, 'remote-harvesting@' + sourceId);
            return true;
        }
        move.moveCreep(creep, source, { visualizePathStyle: { stroke: '#ffaa00' } });
        return true;
    },
};

function adjacentDeposit(creep, snap) {
    if (!snap) return null;
    if (snap.containers) {
        for (let i = 0; i < snap.containers.length; i++) {
            const c = snap.containers[i];
            if (creep.pos.inRangeTo(c, 1) && (c.store.getFreeCapacity(RESOURCE_ENERGY) || 0) > 0) return c;
        }
    }
    return null;
}
