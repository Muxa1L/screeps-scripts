var pathCache = require('pathCache');
var roleHarvester = {

    /** @param {Creep} creep **/
    run: function(creep) {
        var sources = creep.room.find(FIND_SOURCES_ACTIVE);
        var targetSource = creep.pos.findClosestByPath(sources);
	    if((creep.carry.energy < creep.carryCapacity && creep.pos.isNearTo(targetSource)) || creep.carry.energy == 0 ) {
            // Harvesting logic with path caching
            var path = pathCache.getPath(creep.id, targetSource.id);
            if (path) {
                var nextPos = creep.pos.getDirectionTo(path[0]);
                creep.move(nextPos);
            } else {
                if (creep.harvest(targetSource) == ERR_NOT_IN_RANGE) {
                    var ret = PathFinder.search(creep.pos, {pos: targetSource.pos, range: 1});
                    if (!ret.incomplete) {
                        pathCache.storePath(creep.id, targetSource.id, ret.path);
                        var nextPos = creep.pos.getDirectionTo(ret.path[0]);
                        creep.move(nextPos);
                    } else {
                        creep.moveTo(targetSource, {visualizePathStyle: {stroke: '#ffaa00'}});
                    }
                }
            }
        }
        else {
            var targets = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) => {
                        return ((structure.structureType == STRUCTURE_EXTENSION ||
                                 structure.structureType == STRUCTURE_SPAWN ) && structure.energy < structure.energyCapacity);
                    }
            });
            
            if (targets.length == 0){
                
                targets = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) => {
                        return (//(structure.structureType == STRUCTURE_CONTAINER && structure.store[RESOURCE_ENERGY] < structure.storeCapacity)||
                                (structure.structureType == STRUCTURE_TOWER  && structure.energy < structure.energyCapacity));
                    }
            });
            }
            if (targets.length > 0) {
                var target = creep.pos.findClosestByPath(targets);
                // Transfer logic with path caching
                var path = pathCache.getPath(creep.id, target.id);
                if (path) {
                    var nextPos = creep.pos.getDirectionTo(path[0]);
                    creep.move(nextPos);
                } else {
                    if (creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                        var ret = PathFinder.search(creep.pos, {pos: target.pos, range: 1});
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
};

module.exports = roleHarvester;