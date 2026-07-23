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
        return creep.getActiveBodyparts(WORK) > 0 && memory.getRole(creep) === 'miner';
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
        // Spread miners evenly across sources. Each already-claimed slot adds
        // a penalty larger than max in-room distance (49) so a miner prefers a
        // less-crowded source even across the room. Exclude the creep's own
        // claim so a miner already on a source isn't penalized for its own
        // presence and stays put once sources are balanced.
        let claims = sourceRegistry.countClaims(target.id);
        if (memory.getSourceId(creep) === target.id) claims = Math.max(0, claims - 1);
        return dist + claims * 50 + (source && source.energy > 0 ? 0 : 100);
    },
    run: function (creep, task, snap) {
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
            move.moveCreep(creep, slot, { visualizePathStyle: { stroke: '#ffaa00' }, exactTile: true });
            return true;
        }

        if (creep.pos.isNearTo(source)) {
            // Offload phase: deposit carried energy into an adjacent container/storage
            // so it doesn't decay on the floor. Only offload when full (or source depleted)
            // to minimize transfer ticks (each transfer replaces one harvest tick).
            const carried = creep.store[RESOURCE_ENERGY] || 0;
            if (carried > 0 &&
                (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0 || source.energy === 0)) {
                const deposit = adjacentDeposit(creep, snap);
                if (deposit) {
                    const r = creep.transfer(deposit, RESOURCE_ENERGY);
                    if (r === ERR_FULL) {
                        // Container full (haulers behind); drop so sweep can collect.
                        creep.drop(RESOURCE_ENERGY);
                    }
                    move.action(creep, 'mine->store@' + deposit.id);
                    return true;
                }
                // No adjacent container/storage; drop so sweep can collect (legacy behavior).
                creep.drop(RESOURCE_ENERGY);
                move.action(creep, 'mine->drop@' + sourceId);
                return true;
            }

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

function adjacentDeposit(creep, snap) {
    if (!snap) return null;
    if (snap.storage && creep.pos.inRangeTo(snap.storage, 1) &&
        (snap.storage.store.getFreeCapacity(RESOURCE_ENERGY) || 0) > 0) {
        return snap.storage;
    }
    if (snap.containers) {
        for (let i = 0; i < snap.containers.length; i++) {
            const c = snap.containers[i];
            if (creep.pos.inRangeTo(c, 1) &&
                (c.store.getFreeCapacity(RESOURCE_ENERGY) || 0) > 0) {
                return c;
            }
        }
    }
    return null;
}
