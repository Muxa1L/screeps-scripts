const TaskType = require('taskBaseClass');
const taskBase = require('taskBase');
const move = require('moveUtil');
const roomManager = require('roomManager');

const STORAGE_WITHDRAW_MIN = 200;
const CONTAINER_WITHDRAW_MIN = 50;
const DROPPED_ENERGY_MIN = 50;

function findEnergySource(creep) {
    const snap = roomManager.get(creep.room.name);
    if (!snap) return null;

    if (snap.storage && snap.storage.store[RESOURCE_ENERGY] >= STORAGE_WITHDRAW_MIN) {
        return snap.storage;
    }
    if (snap.containers) {
        let best = null;
        let bestEnergy = 0;
        for (let i = 0; i < snap.containers.length; i++) {
            const c = snap.containers[i];
            const energy = c.store[RESOURCE_ENERGY] || 0;
            if (energy >= CONTAINER_WITHDRAW_MIN && energy > bestEnergy) {
                bestEnergy = energy;
                best = c;
            }
        }
        if (best) return best;
    }
    if (snap.droppedEnergy && snap.droppedEnergy.length > 0) {
        const bestDrop = creep.pos.findClosestByPath(snap.droppedEnergy);
        if (bestDrop && bestDrop.amount >= DROPPED_ENERGY_MIN) {
            return bestDrop;
        }
    }
    return null;
}

module.exports = new TaskType({
    type: 'build',
    priority: taskBase.PRIORITY.BUILD,
    cap: 2,
    canDo: function (creep) {
        return creep.getActiveBodyparts(WORK) > 0 && creep.getActiveBodyparts(CARRY) > 0;
    },
    tasks: function (room, snap) {
        return snap.constructionSites.map(function (s) { return { target: s }; });
    },
    score: function (creep, target) {
        return taskBase.pathScore(creep, target);
    },
    run: function (creep, task) {
        const site = task.target;
        if (!site) return false;
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
        const res = creep.build(site);
        if (res === ERR_NOT_IN_RANGE) {
            move.action(creep, 'moving->build@' + site.id);
            move.moveCreep(creep, site, { visualizePathStyle: { stroke: '#ffffff' } });
            return true;
        }
        move.action(creep, 'building@' + site.id);
        if (res === OK && site.progressTotal - site.progress <= creep.getActiveBodyparts(WORK) * BUILD_POWER) {
            return false;
        }
        return true;
    },
});
