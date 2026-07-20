var pathCache = require('pathCache');
var roleBuilder = {
 
    /** @param {Creep} creep **/
    run: function(creep) {
 
        if(creep.memory.building && creep.carry.energy == 0) {
            creep.memory.building = false;
            creep.say('?? harvest');
        }
        if(!creep.memory.building && creep.carry.energy == creep.carryCapacity) {
            creep.memory.building = true;
            creep.say('?? build');
        }
 
        if(creep.memory.building) {
            var targets = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
            if(targets.length) {
                var target = creep.pos.findClosestByPath(targets);
                // Building logic with path caching
                var path = pathCache.getPath(creep.id, target.id);
                if (path) {
                    var nextPos = creep.pos.getDirectionTo(path[0]);
                    creep.move(nextPos);
                } else {
                    if(creep.build(target) == ERR_NOT_IN_RANGE) {
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
                targets = creep.room.find(FIND_STRUCTURES, {
                    filter: (i) => i.structureType == STRUCTURE_CONTAINER &&
                                   i.store[RESOURCE_ENERGY] > 0
                });
                /*targets = creep.room.find(FIND_MY_STRUCTURES, {
                    filter: { structureType: STRUCTURE_CONTAINER }
                });*/
                console.log(targets);
                if(targets.length) {
                    var target = creep.pos.findClosestByPath(targets);
                    // Repair logic with path caching
                    var path = pathCache.getPath(creep.id, target.id);
                    if (path) {
                        var nextPos = creep.pos.getDirectionTo(path[0]);
                        creep.move(nextPos);
                    } else {
                        if(creep.repair(target) == ERR_NOT_IN_RANGE) {
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
                
            }
        }
        else {
            var sources = creep.room.find(FIND_SOURCES_ACTIVE);
            var closest = creep.pos.findClosestByPath(sources)
            // Harvesting logic with path caching
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

module.exports = roleBuilder;