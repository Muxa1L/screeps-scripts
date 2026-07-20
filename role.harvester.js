var roleHarvester = {

    /** @param {Creep} creep **/
    run: function(creep) {
        var sources = creep.room.find(FIND_SOURCES_ACTIVE);
        //console.log(creep.name + ' ' + _.sum(creep.carry) < creep.carryCapacity + ' ' + creep.carry.energy < creep.carryCapacity);
	    if((creep.carry.energy < creep.carryCapacity && creep.pos.isNearTo(creep.pos.findClosestByRange(sources))) || creep.carry.energy == 0 ) {
            var closest = creep.pos.findClosestByPath(sources)
            if(creep.harvest(closest) == ERR_NOT_IN_RANGE) {
                creep.moveTo(closest, {visualizePathStyle: {stroke: '#ffaa00'}});
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
                if(creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }
        }
	}
};

module.exports = roleHarvester;