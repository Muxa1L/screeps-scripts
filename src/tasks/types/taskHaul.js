const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');
const memory = require('../../utils/memorySchema');
const depositService = require('../../services/depositService');
const roomFlags = require('../../utils/roomFlags');

module.exports = {
    type: 'haul',
    priority: taskBase.PRIORITY.HAUL,
    requirements: { carry: 1 },
    cap: 2,
    capFor: function (room, snap) {
        const rcl = (snap.controller && snap.controller.level) || 1;
        return Math.min(6, 1 + Math.floor((snap.energyStructures ? snap.energyStructures.length : 0) / 5) + Math.floor(rcl / 2));
    },
    canDo: function (creep) {
        return creep.getActiveBodyparts(CARRY) > 0;
    },
    tasks: function (room, snap) {
        const out = [];
        if (!snap.containers) return out;
        const priorityIds = roomFlags.getPriorityContainerIds(room.name);
        for (let i = 0; i < snap.containers.length; i++) {
            const c = snap.containers[i];
            if (priorityIds[c.id]) continue; // flagged containers are caches, not haul sources
            if (c.store[RESOURCE_ENERGY] >= 100) out.push({ target: c });
        }
        return out;
    },
    score: function (creep, target) {
        const dist = taskBase.approxDistance(creep, target);
        const energy = target.store ? (target.store[RESOURCE_ENERGY] || 0) : 0;
        // Strongly prefer fuller containers. A full 2000-energy container can
        // overcome ~40 tiles of distance, which keeps haulers on local sources
        // but lets a very full cache win over a closer near-empty one.
        return dist - Math.min(energy / 50, 40);
    },
    run: function (creep, task, snap) {
        const container = task.target ? Game.getObjectById(task.target.id) : null;
        if (!container || !container.store) return false;

        // Pick the first non-empty resource in store (energy by default,
        // or a mineral when full and storage has space for it).
        let resourceType = RESOURCE_ENERGY;
        for (const r in creep.store) {
            if (creep.store[r] > 0 && r !== RESOURCE_ENERGY) {
                resourceType = r;
                break;
            }
        }
        const energy = (creep.store[RESOURCE_ENERGY] || 0);
        const freeCapacity = creep.store.getFreeCapacity(resourceType) || 0;
        const hauledFrom = memory.getHauledFrom(creep);

        if (energy === 0) {
            memory.clearHauledFrom(creep);
        }

        // Delivery phase: we have energy (or are full) and a deposit exists.
        // Always exclude the source container so we don't dump back into it.
        if (energy > 0 && (freeCapacity === 0 || !depositService.structureNeedsEnergy(container) || hauledFrom === container.id || (container.store[RESOURCE_ENERGY] || 0) === 0)) {
            const deposit = depositService.findDeposit(creep, snap, {
                excludeId: container.id,
                excludeTypes: { [STRUCTURE_SPAWN]: true, [STRUCTURE_EXTENSION]: true, [STRUCTURE_TOWER]: true },
                resourceType: resourceType,
            });
            if (!deposit) {
                // No deposit available; keep hauling this container rather than
                // flipping to a different source every tick.
                return true;
            }
            const hadEnergy = energy;
            const stillCarrying = depositService.transferTo(creep, deposit, resourceType);
            // Keep the haul task after a successful delivery so the creep can
            // reselect a source container in the next tick without a full
            // task-release/reassignment cycle. Release only when the creep is
            // fully empty and standing on an empty or missing source container.
            if (hadEnergy > 0 && !stillCarrying && (!container || !container.store || (container.store[RESOURCE_ENERGY] || 0) === 0)) return false;
            return true;
        }

        // Collection phase: withdraw from the source container.
        const containerEnergy = container.store ? (container.store[RESOURCE_ENERGY] || 0) : 0;
        if (containerEnergy > 0) {
            move.action(creep, 'withdraw@' + container.id);
            const wRes = creep.withdraw(container, RESOURCE_ENERGY);
            if (wRes === ERR_NOT_IN_RANGE) {
                move.moveCreep(creep, container, { visualizePathStyle: { stroke: '#ffffaa' } });
                return true;
            }
            if (wRes === OK) memory.setHauledFrom(creep, container.id);
            // After a successful withdraw (or fill-then-stop on a partial
            // source), keep the task so the next tick delivers.
            return wRes === OK || wRes === ERR_FULL;
        }

        // Source container is empty but creep still has room — try to top up
        // from nearby containers and dropped energy before heading to delivery.
        if (freeCapacity > 0 && snap.containers) {
            const priorityIds = roomFlags.getPriorityContainerIds(creep.pos.roomName);
            // Check adjacent containers (range 3) that are haul sources.
            for (let i = 0; i < snap.containers.length; i++) {
                const c = snap.containers[i];
                if (c.id === container.id) continue;
                if (priorityIds[c.id]) continue;
                const cEnergy = c.store[RESOURCE_ENERGY] || 0;
                if (cEnergy < 100) continue;
                const cRange = taskBase.approxDistance(creep, c);
                if (cRange > 3) continue;
                move.action(creep, 'withdraw@' + c.id);
                const r = creep.withdraw(c, RESOURCE_ENERGY);
                if (r === ERR_NOT_IN_RANGE) {
                    move.moveCreep(creep, c, { visualizePathStyle: { stroke: '#ffffaa' } });
                    return true;
                }
                if (r === OK) return true;
            }
            // Check adjacent dropped energy (range 3).
            if (snap.droppedEnergy) for (let i = 0; i < snap.droppedEnergy.length; i++) {
                const d = snap.droppedEnergy[i];
                if ((d.amount || 0) < 50) continue;
                const dRange = taskBase.approxDistance(creep, d);
                if (dRange > 3) continue;
                move.action(creep, 'pickup@' + d.id);
                const r = creep.pickup(d);
                if (r === ERR_NOT_IN_RANGE) {
                    move.moveCreep(creep, d, { visualizePathStyle: { stroke: '#ffffaa' }, exactTile: true });
                    return true;
                }
                if (r === OK) return true;
            }
        }

        return false;
    },
};
