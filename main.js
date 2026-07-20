var roleHarvester = require('role.harvester');
var roleUpgrader = require('role.upgrader');
var roleBuilder = require('role.builder');
var roleFighter = require('role.fighter');
var roleWorker = require('role.worker');
var miscUpkeep = require('misc.upkeep');

module.exports.loop = function () {

    miscUpkeep.run();
    var mainRoom = Game.spawns['Spawn1'].room
    //console.log(mainRoom.energyAvailable + ':' + mainRoom.energyCapacityAvailable);
    var consSites = mainRoom.find(FIND_MY_CONSTRUCTION_SITES);
    var energySites = mainRoom.find(FIND_STRUCTURES, {
                    filter: (structure) => {
                        return ((structure.structureType == STRUCTURE_EXTENSION ||
                                 structure.structureType == STRUCTURE_SPAWN ||
                                 structure.structureType == STRUCTURE_TOWER)  && structure.energy < structure.energyCapacity);
                    }
            });
    var drops = mainRoom.find(FIND_DROPPED_RESOURCES, {
        filter: function(object) {
            return object.amount > 10;
        }
    });
    var tombStones = mainRoom.find(FIND_TOMBSTONES, {
        filter: function(object) {
            return _.sum(object.store) > 10;
        }
    });
    var ruins = mainRoom.find(FIND_RUINS, {
        filter: function(object) {
            return _.sum(object.store) > 10;
        }
    });
    // Cleanup path cache every 10 ticks
    var pathCache = require('pathCache');
    pathCache.cleanup();
    for(var name in Game.creeps) {
        var creep = Game.creeps[name];
        if ((drops.length > 0) && creep.carry.energy == 0){
            if (creep.pickup(drops[0]) == ERR_NOT_IN_RANGE){
                creep.moveTo(drops[0]);
                creep.say('sweeping');
            }
            continue;
        }
        if ((tombStones.length > 0) && creep.carry.energy == 0){
            if (creep.withdraw(tombStones[0],RESOURCE_ENERGY) == ERR_NOT_IN_RANGE){
                creep.moveTo(tombStones[0]);
                creep.say('sweeping');
            }
            var resource = Object.keys(tombStones[0])[1];
            if (creep.withdraw(tombStones[0],resource) == ERR_NOT_IN_RANGE){
                creep.moveTo(tombStones[0]);
                creep.say('sweeping');
            }
            continue;
        }
        if ((ruins.length > 0) && creep.carry.energy == 0){
            if (creep.withdraw(ruins[0],RESOURCE_ENERGY) == ERR_NOT_IN_RANGE){
                creep.moveTo(ruins[0]);
                creep.say('sweeping ruins');
            }
            var resource = Object.keys(ruins[0])[1];
            if (creep.withdraw(ruins[0],resource) == ERR_NOT_IN_RANGE){
                creep.moveTo(ruins[0]);
                creep.say('sweeping ruins');
            }
            continue;
        }
        if ((creep.ticksToLive < 400 || creep.memory.renewing) && Game.spawns['Spawn1'].energy > 50){
            if (creep.body.length < 6){
                if (Game.spawns['Spawn1'].recycleCreep(creep) == ERR_NOT_IN_RANGE){
                    creep.moveTo(Game.spawns['Spawn1']);
                    creep.say('suiciding');
                }
            }
            else{
                switch(Game.spawns['Spawn1'].renewCreep(creep)){
                case ERR_NOT_IN_RANGE:
                    creep.moveTo(Game.spawns['Spawn1']);
                    creep.say('recharging');
                    break;
                case OK: 
                    creep.memory.renewing = true;
                    break;
                case ERR_FULL: 
                    creep.memory.renewing = false;
                    break;
                }
            }
            
            continue;
        }
        /*if(creep.room.controller) {
            if(creep.signController(creep.room.controller, "") == ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller);
            }
        }*/
        if(_.sum(creep.carry) - creep.carry.energy> 0){
            var target = creep.pos.findClosestByRange(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (structure.structureType == STRUCTURE_CONTAINER && _.sum(structure.store) < structure.storeCapacity)
                }
            });
            var resource = Object.keys(creep.carry)[1];
            if (creep.transfer(target, resource) == ERR_NOT_IN_RANGE){
                creep.moveTo(target);
            }
            continue;
        }
        if(creep.memory.role == 'harvester') {
            //roleHarvester.run(creep);
            //roleBuilder.run(creep);    
            //roleWorker.run(creep);
            if (energySites.length > 0)
            {
                roleHarvester.run(creep)
            }
            else if (consSites.length > 0){
                roleBuilder.run(creep);    
            }
            else {
                //creep.memory.building = false;
                roleUpgrader.run(creep);
            }
            //roleUpgrader.run(creep);
        }
        if(creep.memory.role == 'upgrader') {
            roleUpgrader.run(creep);
        }
        if(creep.memory.role == 'builder') {
            roleBuilder.run(creep);
        }
        if(creep.memory.role == 'fighter'){
            roleFighter.run(creep)
        }
    }
}