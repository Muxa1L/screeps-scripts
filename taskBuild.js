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

    // Harvesters harvest from sources; don't drain storage/containers
    // (those are for haulers, and harvesters have WORK to harvest directly).
    if (creep.memory.role === 'harvester') {
        if (snap.sources && snap.sources.length > 0) {
            const safe = snap.sources.filter(function (s) {
                return !roomManager.isPosNearHostile(creep.room.name, s.pos, 5);
            });
            if (safe.length > 0) return creep.pos.findClosestByPath(safe);
        }
        return null;
    }

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
    if (!best && snap.sources && snap.sources.length > 0) {
        const safe = snap.sources.filter(function (s) {
            return !roomManager.isPosNearHostile(creep.room.name, s.pos, 5);
        });
        if (safe.length > 0) return creep.pos.findClosestByPath(safe);
    }
    return best;
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
        if (!site || !site.id) return false;
        const live = Game.getObjectById(site.id);
        if (!live || live.progress === undefined) return false;
        const capacity = creep.store.getCapacity(RESOURCE_ENERGY) || 0;
        const energy = creep.store[RESOURCE_ENERGY] || 0;
        const workParts = creep.getActiveBodyparts(WORK);
        const minEnergy = workParts * BUILD_POWER;
        const isFull = energy >= capacity;
        if (isFull) creep.memory._refueling = false;
        if (creep.memory._refueling || energy < minEnergy) {
            if (!isFull) {
                const source = findEnergySource(creep);
                if (source) {
                    creep.memory._refueling = true;
                    move.action(creep, 'refuel@' + source.id);
                    if (source.store) {
                        if (creep.withdraw(source, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                            move.moveCreep(creep, source, { visualizePathStyle: { stroke: '#ffffaa' } });
                        }
                    } else if (source.amount !== undefined) {
                        if (creep.pickup(source) === ERR_NOT_IN_RANGE) {
                            move.moveCreep(creep, source, { visualizePathStyle: { stroke: '#ffff00' } });
                        }
                    } else {
                        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                            move.moveCreep(creep, source, { visualizePathStyle: { stroke: '#ffaa00' } });
                        }
                    }
                    return true;
                }
            }
            creep.memory._refueling = false;
            if (energy === 0) return false;
        }
        const res = creep.build(live);
        if (res === ERR_NOT_IN_RANGE) {
            move.action(creep, 'moving->build@' + live.id);
            move.moveCreep(creep, live, { visualizePathStyle: { stroke: '#ffffff' } });
            return true;
        }
        move.action(creep, 'building@' + live.id);
        if (res === OK && live.progressTotal - live.progress <= workParts * BUILD_POWER) {
            return false;
        }
        return true;
    },
});
