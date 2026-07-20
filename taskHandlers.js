var taskBase = require('taskBase');
var sourceRegistry = require('sourceRegistry');
var logger = require('logger');

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
    if (!t.pos) return false;
    if (creep.carryCapacity === 0) return false;

    var amount;
    var pick;
    if (t.store) {
        var keys = Object.keys(t.store);
        for (var i = 0; i < keys.length; i++) {
            if (t.store[keys[i]] > 0) { pick = keys[i]; break; }
        }
        if (!pick) return false;
        amount = t.store[pick];
    } else {
        pick = RESOURCE_ENERGY;
        amount = t.amount;
    }
    if (!amount || amount <= 0) return false;

    if (creep.carry.energy >= creep.carryCapacity) return false;

    if (creep.pos.isNearTo(t)) {
        var res;
        if (t.store) {
            res = creep.withdraw(t, pick);
            logger.setAction(creep, 'withdraw@' + t.id);
        } else {
            res = creep.pickup(t);
            logger.setAction(creep, 'pickup@' + t.id);
        }
        return res !== ERR_NOT_IN_RANGE;
    }

    logger.setAction(creep, 'moving->sweep@' + t.id);
    taskBase.moveCreep(creep, t, { visualizePathStyle: { stroke: '#ffff00' } });
    if (Game.time % 50 === 0 && Memory.flags && Memory.flags.debugSweep) {
        console.log('[sweep] ' + creep.name + ' -> ' + t.id + ' carry=' + creep.carry.energy + '/' + creep.carryCapacity);
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
        logger.setAction(creep, 'transfer@' + nearest.id);
        if (creep.transfer(nearest, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            taskBase.moveCreep(creep, nearest, { visualizePathStyle: { stroke: '#ffffff' } });
        }
        return true;
    }
    if (creep.carry.energy > 0) return true;
    logger.setAction(creep, 'withdraw@' + container.id);
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
        logger.setAction(creep, 'moving->mine@' + source.id);
        taskBase.moveCreep(creep, slot, { visualizePathStyle: { stroke: '#ffaa00' } });
        return true;
    }
    var ret = creep.harvest(source);
    if (ret === OK) logger.setAction(creep, 'harvesting@' + source.id);
    if (ret === ERR_NOT_IN_RANGE) {
        taskBase.moveCreep(creep, source, { visualizePathStyle: { stroke: '#ffaa00' } });
    }
    return true;
};

handlers.harvest = function (creep, task) {
    var source = task.target;
    if (!source) return false;
    if (creep.carry.energy === creep.carryCapacity) {
        return false;
    }
    var ret = creep.harvest(source);
    if (ret === OK) {
        logger.setAction(creep, 'harvesting@' + source.id);
        return true;
    }
    logger.setAction(creep, 'moving->harvest@' + source.id);
    if (ret === ERR_NOT_IN_RANGE) {
        taskBase.moveCreep(creep, source, { visualizePathStyle: { stroke: '#ffaa00' } });
    }
    return true;
};

handlers.build = function (creep, task) {
    var site = task.target;
    if (!site) return false;
    if (creep.carry.energy === 0) return false;
    var before = site.progress;
    var res = creep.build(site);
    if (res === ERR_NOT_IN_RANGE) {
        logger.setAction(creep, 'moving->build@' + site.id);
        taskBase.moveCreep(creep, site, { visualizePathStyle: { stroke: '#ffffff' } });
        return true;
    }
    logger.setAction(creep, 'building@' + site.id);
    if (res === OK && site.progressTotal - site.progress <= creep.getActiveBodyparts(WORK) * BUILD_POWER) {
        return false;
    }
    return true;
};

handlers.repair = function (creep, task) {
    var target = task.target;
    if (!target) return false;
    if (creep.carry.energy === 0) return false;
    if (target.hits >= target.hitsMax) return false;
    var res = creep.repair(target);
    if (res === ERR_NOT_IN_RANGE) {
        logger.setAction(creep, 'moving->repair@' + target.id);
        taskBase.moveCreep(creep, target, { visualizePathStyle: { stroke: '#aaaaff' } });
        return true;
    }
    logger.setAction(creep, 'repairing@' + target.id);
    if (res === OK && target.hitsMax - target.hits <= creep.getActiveBodyparts(WORK) * REPAIR_POWER) {
        return false;
    }
    return true;
};

handlers.upgrade = function (creep, task) {
    var controller = task.target;
    if (!controller) return false;
    if (creep.carry.energy === 0) return false;
    var res = creep.upgradeController(controller);
    if (res === ERR_NOT_IN_RANGE) {
        logger.setAction(creep, 'moving->upgrade');
        taskBase.moveCreep(creep, controller, { visualizePathStyle: { stroke: '#ffffff' } });
        return true;
    }
    logger.setAction(creep, 'upgrading');
    return true;
};

module.exports = handlers;
