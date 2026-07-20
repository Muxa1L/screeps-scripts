/*
 * Module code goes here. Use 'module.exports' to export things:
 * module.exports.thing = 'a thing';
 *
 * You can import it from another modules like this:
 * var mod = require('misc.upkeep');
 * mod.thing == 'a thing'; // true
 */ 
 
var miscUpkeep = {
    run: function(){
        var tower = Game.getObjectById('5eefe2f977f75cccf1a6d65f');
        //tower = null;
        if(tower) {
            var closestHostile = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
            if(closestHostile) {
                tower.attack(closestHostile);
            }
            else{
                var closestDamagedCreep = tower.pos.findClosestByRange(FIND_MY_CREEPS, {
                    filter: (creep) => (creep.hits < creep.hitsMax)
                });
                if (closestDamagedCreep){
                    tower.heal(closestDamagedCreep);
                }
                else{
                    var closestDamagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
                        filter: (structure) => ((structure.hits < structure.hitsMax-900 && (structure.structureType != STRUCTURE_WALL && structure.structureType != STRUCTURE_RAMPART))||
                        (structure.hits < 100000 && (structure.structureType == STRUCTURE_WALL || structure.structureType == STRUCTURE_RAMPART)))
                    });
                    if(closestDamagedStructure) {
                        tower.repair(closestDamagedStructure);
                    }
                }
                
            }
            
    
            
        }
        //move=50, work=100, carry=50
        // total 800
        var worker = [WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE];
        var workerEnergy = 800;
        //var worker = [WORK, CARRY,CARRY,MOVE,MOVE];
        var fighter = [TOUGH,TOUGH,TOUGH,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,ATTACK,ATTACK,ATTACK];
        var harvesters = _.filter(Game.creeps, (creep) => creep.memory.role == 'harvester');
        var upgraders = _.filter(Game.creeps, (creep) => creep.memory.role == 'upgrader');
        //var builders = _.filter(Game.creeps, (creep) => creep.memory.role == 'builder');
        var enemies = Game.spawns['Spawn1'].room.find(FIND_HOSTILE_CREEPS);
        if (harvesters.length <= 2){
            worker = [WORK, CARRY,CARRY,MOVE,MOVE];
            workerEnergy = 300;
        }
        //console.log(Game.spawns['Spawn1'].room.energyAvailable);
        if (Game.spawns['Spawn1'].room.energyAvailable >= workerEnergy){
            if (enemies.length > 0){
                var fighters = _.filter(Game.creeps, (creep) => creep.memory.role == 'fighter');
                if (fighters.length == 0){
                    console.log('Spawning new fighter')
                    Game.spawns['Spawn1'].spawnCreep(fighter, 'Fighter'+ Game.time,{memory: {role: 'fighter'}});
                }
            }
            if(harvesters.length < 5) {
                var newName = 'Harvester' + Game.time;
                console.log('Spawning new harvester: ' + newName);
                console.log(Game.spawns['Spawn1'].spawnCreep(worker, newName, {memory: {role: 'harvester'}}));        
            }
            else if(upgraders.length < 3){
                var newName = 'Upgrader' + Game.time;
                console.log('Spawning new harvester: ' + newName);
                Game.spawns['Spawn1'].spawnCreep(worker, newName, 
                    {memory: {role: 'upgrader'}});        
            }
            
        }
        /*
        if(Game.spawns['Spawn1'].spawning) { 
            var spawningCreep = Game.creeps[Game.spawns['Spawn1'].spawning.name];
            Game.spawns['Spawn1'].room.visual.text(
                '???' + spawningCreep.memory.role,
                Game.spawns['Spawn1'].pos.x + 1, 
                Game.spawns['Spawn1'].pos.y, 
                {align: 'left', opacity: 0.8});
        }*/
        for(var name in Memory.creeps) {
        if(!Game.creeps[name]) {
            delete Memory.creeps[name];
            console.log('Clearing non-existing creep memory:', name);
        }
    }
    }
}

module.exports = miscUpkeep;