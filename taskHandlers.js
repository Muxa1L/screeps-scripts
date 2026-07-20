var taskBase = require('taskBase');
var sourceRegistry = require('sourceRegistry');

var handlers = {};

handlers.defend = function (creep, task) {
    var target = task.target;
    if (!target || target.hits === undefined || target.hits <= 0) {
        return false;
    }
    var attackParts = creep.getActiveBodyparts(ATTACK);
    var rangedParts = creep.getActiveBodyparts(RANGED_ATTACK);
    if (attackParts === 0 && rangedParts === 0) {
        return false;
    }
    if (creep.hits < creep.hitsMax * 0.4) {
        var retreat = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
        if (retreat) {
            taskBase.moveCreep(creep, retreat, { visualizePathStyle: { stroke: '#ff0000' } });
        }
        return true;
    }
    if (creep.pos.inRangeTo(target, 1) && rangedParts > 0 && attackParts === 0) {
        creep.rangedMassAttack();
    }
    if (attackParts > 0) {
        var res = creep.attack(target);
        if (res === ERR_NOT_IN_RANGE) {
            taskBase.moveCreep(creep, target, { visualizePathStyle: { stroke: '#ff0000' } });
        }
    } else if (rangedParts > 0) {
        var res2 = creep.rangedAttack(target);
        if (res2 === ERR_NOT_IN_RANGE) {
            taskBase.moveCreep(creep, target, { visualizePathStyle: { stroke: '#ff0000' } });
        }
    }
    return true;
};

handlers.heal = function (creep, task) {
    if (creep.getActiveBodyparts(HEAL) === 0) return false;
    var target = task.target;
    if (!target) return false;
    if (creep.hits < creep.hitsMax) {
        creep.heal(creep);
        return true;
    }
    if (creep.heal(target) === ERR_NOT_IN_RANGE) {
        if (creep.pos.isNearTo(target)) {
            creep.rangedHeal(target);
        } else {
            taskBase.moveCreep(creep, target, { visualizePathStyle: { stroke: '#00ff00' } });
        }
    }
    return true;
};

handlers.sweep = function (creep, task) {
    var t = task.target;
    if (!t) return false;
    if (creep.carry.energy > 0) return false;
    if (creep.carryCapacity === 0) return false;
    var resource;
    if (t.store) {
        resource = Object.keys(t.store).find(function (k) { return t.store[k] > 0; });
    }
    if (!resource) resource = RESOURCE_ENERGY;
    var amount = t.store ? t.store[resource] : t.amount;
    if (!amount || amount <= 0) return false;
    var res = creep.pickup ? creep.withdraw(t, resource) : ERR_INVALID_ARGS;
    if (res === undefined || res === ERR_INVALID_ARGS) {
        if (t.amount !== undefined) res = creep.pickup(t);
    }
    if (res === ERR_NOT_IN_RANGE) {
        taskBase.moveCreep(creep, t, { visualizePathStyle: { stroke: '#ffff00' } });
    }
    return true;
};

handlers.haul = function (creep, task) {
    var container = task.target;
    if (!container) return false;
    if (creep.carry.energy === creep.carryCapacity) {
        var targets = creep.room.find(FIND_STRUCTURES, {
            filter: function (s) {
                return (s.structureType === STRUCTURE_EXTENSION ||
                        s.structureType === STRUCTURE_SPAWN ||
                        s.structureType === STRUCTURE_TOWER) &&
                       s.energy < s.energyCapacity;
            },
        });
        if (targets.length === 0) {
            return false;
        }
        var nearest = creep.pos.findClosestByPath(targets);
        if (!nearest) return false;
        if (creep.transfer(nearest, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            taskBase.moveCreep(creep, nearest, { visualizePathStyle: { stroke: '#ffffff' } });
        }
        return true;
    }
    if (creep.carry.energy > 0) return true;
    if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        taskBase.moveCreep(creep, container, { visualizePathStyle: { stroke: '#ffffaa' } });
    }
    return true;
};

handlers.mine = function (creep, task) {
    var source = task.target;
    if (!source) return false;
    if (!creep.memory.sourceId) {
        creep.memory.sourceId = source.id;
        sourceRegistry.claimSlot(source.id, creep.name);
    } else if (creep.memory.sourceId !== source.id) {
        sourceRegistry.releaseClaim(creep.name);
        creep.memory.sourceId = source.id;
        sourceRegistry.claimSlot(source.id, creep.name);
    }
    var slot = sourceRegistry.slotPos(source.id, creep.name);
    if (slot && !creep.pos.isEqualTo(slot)) {
        taskBase.moveCreep(creep, slot, { visualizePathStyle: { stroke: '#ffaa00' } });
        return true;
    }
    var ret = creep.harvest(source);
    if (ret === ERR_NOT_IN_RANGE) {
        taskBase.moveCreep(creep, source, { visualizePathStyle: { stroke: '#ffaa00' } });
    }
    return true;
};

handlers.harvest = function (creep, task) {
    var source = task.target;
    if (!source) return false;
    if (creep.carry.energy === creep.carryCapacity) {
        var targets = creep.room.find(FIND_STRUCTURES, {
            filter: function (s) {
                return (s.structureType === STRUCTURE_EXTENSION ||
                        s.structureType === STRUCTURE_SPAWN) &&
                       s.energy < s.energyCapacity;
            },
        });
        if (targets.length === 0) {
            targets = creep.room.find(FIND_STRUCTURES, {
                filter: function (s) {
                    return s.structureType === STRUCTURE_TOWER && s.energy < s.energyCapacity;
                },
            });
        }
        if (targets.length === 0) return false;
        var nearest = creep.pos.findClosestByPath(targets);
        if (!nearest) return false;
        if (creep.transfer(nearest, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            taskBase.moveCreep(creep, nearest, { visualizePathStyle: { stroke: '#ffffff' } });
        }
        return true;
    }
    if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
        taskBase.moveCreep(creep, source, { visualizePathStyle: { stroke: '#ffaa00' } });
    }
    return true;
};

handlers.build = function (creep, task) {
    var site = task.target;
    if (!site) return false;
    if (creep.carry.energy === 0) return false;
    if (creep.build(site) === ERR_NOT_IN_RANGE) {
        taskBase.moveCreep(creep, site, { visualizePathStyle: { stroke: '#ffffff' } });
    }
    return true;
};

handlers.repair = function (creep, task) {
    var target = task.target;
    if (!target) return false;
    if (creep.carry.energy === 0) return false;
    if (creep.repair(target) === ERR_NOT_IN_RANGE) {
        taskBase.moveCreep(creep, target, { visualizePathStyle: { stroke: '#aaaaff' } });
    }
    return true;
};

handlers.upgrade = function (creep, task) {
    var controller = task.target;
    if (!controller) return false;
    if (creep.carry.energy === 0) return false;
    if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
        taskBase.moveCreep(creep, controller, { visualizePathStyle: { stroke: '#ffffff' } });
    }
    return true;
};

module.exports = handlers;
