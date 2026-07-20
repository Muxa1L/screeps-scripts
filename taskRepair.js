const TaskType = require('taskBaseClass');
const taskBase = require('taskBase');
const move = require('moveUtil');
const roomManager = require('roomManager');


const STORAGE_WITHDRAW_MIN = 200;
const CONTAINER_WITHDRAW_MIN = 50;
const DROPPED_ENERGY_MIN = 100;

function scoreSource(creep, source) {
    const energy = source.store ? (source.store[RESOURCE_ENERGY] || 0) : (source.amount || 0);
    const free = creep.store.getFreeCapacity(RESOURCE_ENERGY);
    const useful = Math.min(energy, free);
    const dist = taskBase.approxDistance(creep, source);
    return useful / Math.max(1, dist);
}

function findEnergySource(creep) {
    const snap = roomManager.get(creep.room.name);
    if (!snap) return null;

    let best = null;
    let bestScore = 0;

    if (snap.storage && snap.storage.store[RESOURCE_ENERGY] >= STORAGE_WITHDRAW_MIN) {
        best = snap.storage;
        bestScore = scoreSource(creep, snap.storage);
    }
    if (snap.containers) {
        for (let i = 0; i < snap.containers.length; i++) {
            const c = snap.containers[i];
            const energy = c.store[RESOURCE_ENERGY] || 0;
            if (energy < CONTAINER_WITHDRAW_MIN) continue;
            const s = scoreSource(creep, c);
            if (s > bestScore) {
                bestScore = s;
                best = c;
            }
        }
    }
    if (snap.droppedEnergy && snap.droppedEnergy.length > 0) {
        for (let i = 0; i < snap.droppedEnergy.length; i++) {
            const drop = snap.droppedEnergy[i];
            if (drop.amount < DROPPED_ENERGY_MIN) continue;
            const s = scoreSource(creep, drop);
            if (s > bestScore) {
                bestScore = s;
                best = drop;
            }
        }
    }
    return best;
}

module.exports = new TaskType({
    type: 'repair',
    priority: taskBase.PRIORITY.REPAIR,
    cap: 2,
    canDo: function (creep) {
        return creep.getActiveBodyparts(WORK) > 0 && creep.getActiveBodyparts(CARRY) > 0;
    },
    tasks: function (room, snap) {
        const out = [];
        for (let i = 0; i < snap.damagedCritical.length; i++) {
            out.push({ target: snap.damagedCritical[i] });
        }
        for (let j = 0; j < snap.damagedNonCritical.length; j++) {
            out.push({ target: snap.damagedNonCritical[j] });
        }
        return out;
    },
    run: function (creep, task) {
        const target = task.target;
        if (!target) return false;
        if (creep.store[RESOURCE_ENERGY] === 0) {
            const source = findEnergySource(creep);
            if (!source) return false;
            move.action(creep, 'refuel@' + source.id);
            if (source.store) {
                if (creep.withdraw(source, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    move.moveCreep(creep, source, { visualizePathStyle: { stroke: '#ffffaa' } });
                }
            } else {
                if (creep.pickup(source) === ERR_NOT_IN_RANGE) {
                    move.moveCreep(creep, source, { visualizePathStyle: { stroke: '#ffff00' } });
                }
            }
            return true;
        }
        if (target.hits >= target.hitsMax) return false;
        const res = creep.repair(target);
        if (res === ERR_NOT_IN_RANGE) {
            move.action(creep, 'moving->repair@' + target.id);
            move.moveCreep(creep, target, { visualizePathStyle: { stroke: '#aaaaff' } });
            return true;
        }
        move.action(creep, 'repairing@' + target.id);
        if (res === OK && target.hitsMax - target.hits <= creep.getActiveBodyparts(WORK) * REPAIR_POWER) {
            return false;
        }
        return true;
    },
});
