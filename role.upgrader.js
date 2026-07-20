var pathCache = require('pathCache');
var roleUpgrader = {
 
    /** @param {Creep} creep **/
    run: function(creep) {
 
        if(creep.memory.upgrading && creep.carry.energy == 0) {
            creep.memory.upgrading = false;
            creep.say('?? harvest');
        }
        if(!creep.memory.upgrading && creep.carry.energy == creep.carryCapacity) {
            creep.memory.upgrading = true;
            creep.say('? upgrade');
        }
 
        if(creep.memory.upgrading) {
            // Upgrading controller logic with path caching
            var target = creep.room.controller;
            var path = pathCache.getPath(creep.id, target.id);
            if (path) {
                var nextPos = creep.pos.getDirectionTo(path[0]);
                creep.move(nextPos);
            } else {
                if(creep.upgradeController(target) == ERR_NOT_IN_RANGE) {
                    var ret = PathFinder.search(creep.pos, {pos: target.pos, range: 3});
                    if (!ret.incomplete) {
                        pathCache.storePath(creep.id, target.id, ret.path);
                        var nextPos = creep.pos.getDirectionTo(ret.path[0]);
                        creep.move(nextPos);
                    } else {
                        creep.moveTo(target, {visualizePathStyle: {stroke: '#ffffff'}});
                    }
                }
            }
        }
        else {
            // Harvesting logic with path caching
            var sources = creep.room.find(FIND_SOURCES_ACTIVE);
            var closest = creep.pos.findClosestByPath(sources);
            var path = pathCache.getPath(creep.id, closest.id);
            if (path) {
                var nextPos = creep.pos.getDirectionTo(path[0]);
                creep.move(nextPos);
            } else {
                if(creep.harvest(closest) == ERR_NOT_IN_RANGE) {
                    var ret = PathFinder.search(creep.pos, {pos: closest.pos, range: 1});
                    if (!ret.incomplete) {
                        pathCache.storePath(creep.id, closest.id, ret.path);
                        var nextPos = creep.pos.getDirectionTo(ret.path[0]);
                        creep.move(nextPos);
                    } else {
                        creep.moveTo(closest, {visualizePathStyle: {stroke: '#ffaa00'}});
                    }
                }
            }
        }
    }
};
 
module.exports = roleUpgrader;