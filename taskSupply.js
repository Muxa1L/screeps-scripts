const TaskType = require('taskBaseClass');
const taskBase = require('taskBase');
const move = require('moveUtil');
const roomManager = require('roomManager');

const SUPPLY_CRITICAL_THRESHOLD = 0.3;

const WITHDRAW_MIN_STORAGE = 200;
const WITHDRAW_MIN_CONTAINER = 50;

function pickWithdrawSource(snap) {
    if (snap.storage && (snap.storage.store[RESOURCE_ENERGY] || 0) >= WITHDRAW_MIN_STORAGE) {
        return snap.storage;
    }
    if (snap.containers) {
        let best = null;
        let bestEnergy = 0;
        for (let i = 0; i < snap.containers.length; i++) {
            const c = snap.containers[i];
            const energy = c.store[RESOURCE_ENERGY] || 0;
            if (energy >= WITHDRAW_MIN_CONTAINER && energy > bestEnergy) {
                bestEnergy = energy;
                best = c;
            }
        }
        if (best) return best;
    }
    return null;
}

function supplyPriority(snapshot) {
    if (!snapshot || !snapshot.energyStructures || snapshot.energyStructures.length === 0) {
        return taskBase.PRIORITY.UPGRADE;
    }
    let totalCapacity = 0;
    let totalEnergy = 0;
    for (let i = 0; i < snapshot.energyStructures.length; i++) {
        const s = snapshot.energyStructures[i];
        if (s.structureType === STRUCTURE_TOWER) continue;
        totalCapacity += s.store.getCapacity(RESOURCE_ENERGY) || 0;
        totalEnergy += s.store[RESOURCE_ENERGY] || 0;
    }
    if (totalCapacity === 0) return taskBase.PRIORITY.UPGRADE;
    const ratio = totalEnergy / totalCapacity;
    if (ratio < SUPPLY_CRITICAL_THRESHOLD) return 15;
    if (ratio < 0.6) return taskBase.PRIORITY.SUPPLY;
    return taskBase.PRIORITY.UPGRADE;
}

module.exports = new TaskType({
    type: 'supply',
    priority: taskBase.PRIORITY.SUPPLY,
    cap: 3,
    canDo: function (creep) {
        return creep.getActiveBodyparts(CARRY) > 0;
    },
    priorityFor: supplyPriority,
    tasks: function (room, snap) {
        const out = [];
        if (!snap.energyStructures) return out;
        for (let i = 0; i < snap.energyStructures.length; i++) {
            const s = snap.energyStructures[i];
            if (s.structureType === STRUCTURE_TOWER) continue;
            if ((s.store[RESOURCE_ENERGY] || 0) < (s.store.getCapacity(RESOURCE_ENERGY) || 0)) {
                out.push({ target: s });
            }
        }
        return out;
    },
    run: function (creep, task) {
        const target = task.target;
        if (!target || !target.id) return false;
        const live = Game.getObjectById(target.id);
        if (!live || live.store === undefined) return false;
        const capacity = live.store.getCapacity(RESOURCE_ENERGY) || 0;
        const energy = live.store[RESOURCE_ENERGY] || 0;
        if (energy >= capacity) return false;

        if (creep.store[RESOURCE_ENERGY] === 0) {
            const snap = roomManager.get(creep.room.name);
            if (!snap) return false;
            if (snap.droppedEnergy && snap.droppedEnergy.length > 0) {
                const drop = creep.pos.findClosestByPath(snap.droppedEnergy);
                if (drop) {
                    move.action(creep, 'pickup@' + drop.id);
                    if (creep.pickup(drop) === ERR_NOT_IN_RANGE) {
                        move.moveCreep(creep, drop, { visualizePathStyle: { stroke: '#ffff00' } });
                    }
                    return true;
                }
            }
            const withdrawSource = pickWithdrawSource(snap);
            if (withdrawSource) {
                move.action(creep, 'withdraw@' + withdrawSource.id);
                const wres = creep.withdraw(withdrawSource, RESOURCE_ENERGY);
                if (wres === ERR_NOT_IN_RANGE) {
                    move.moveCreep(creep, withdrawSource, { visualizePathStyle: { stroke: '#ffffaa' } });
                }
                return true;
            }
            return false;
        }

        move.action(creep, 'supply@' + live.id);
        const res = creep.transfer(live, RESOURCE_ENERGY);
        if (res === ERR_NOT_IN_RANGE) {
            move.moveCreep(creep, live, { visualizePathStyle: { stroke: '#ffffff' } });
            return true;
        }
        if (res !== OK) return false;
        return creep.store[RESOURCE_ENERGY] > 0;
    },
});
