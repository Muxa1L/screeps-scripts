var roleWorker = {

    /** @param {Creep} creep **/
    run: function(creep) {
        if (!Memory.knownSources || true){
            var sources = creep.room.find(FIND_SOURCES);
            var knownSources = [];
            for (var i = 0; i < sources.length; i++) {
                var source = sources[i];
                var sourceData = new Object();
                sourceData.id = source.id;
                var pos = getPos(source.pos);
                sourceData.pos = pos;
                sourceData.harvestPlaces = [];
                for (var j = -1; j<= 1; j++){
                    for (var k = -1; k<= 1; k++){
                        if (j == 0 && k == 0){
                            continue;
                        }
                        var checkPos = new RoomPosition(pos.x+j, pos.y+k, pos.roomName);
                        var terrain = checkPos.lookFor(LOOK_TERRAIN);
                        if (terrain[0] != 'wall'){
                            sourceData.harvestPlaces.push(getPos(checkPos));
                        }
                        else {
                            var road = checkPos.lookFor(LOOK_STRUCTURES);
                            if (road[0] && road[0].structureType == STRUCTURE_ROAD){
                                sourceData.harvestPlaces.push(getPos(checkPos));
                            }
                        }
                        
                    }
                }
                knownSources.push(sourceData);
            }
            Memory.knownSources = knownSources;
        }
        if (!Memory.sourceToSource){
            var source1 = Memory.knownSources[0].harvestPlaces[0];
            var source2 = Memory.knownSources[1].harvestPlaces[0];
            var pos1 = new RoomPosition(source1.x, source1.y, source1.roomName);
            var pos2 = new RoomPosition(source2.x, source2.y, source2.roomName);
            var route = pos1.findPathTo(pos2);
            Memory.sourceToSource = route;
        }
        if (Memory.sourceToSource){
            var route = Memory.sourceToSource;
            for (var i = 0; i < (route.length) - 1; i++){
                creep.room.visual.line(route[i].x, route[i].y, route[i+1].x, route[i+1].y);
            }
            if (!Game.flags['QueueEnd'] && route.length > 0){
                var routeMiddle = route[Math.trunc(route.length/2)];
                creep.room.createFlag(routeMiddle.x, routeMiddle.y, 'QueueEnd');
            }
        }
        
        if (!creep.memory.state){
            creep.memory.state = 'harvesting';
        }/*
        if (creep.carry.energy == 0 || creep.memory.state == 'harvesting'){
            var sources = creep.room.find(FIND_SOURCES);
            var closest = creep.pos.findClosestByPath(sources)
            if(creep.harvest(closest) == ERR_NOT_IN_RANGE) {
                creep.moveTo(closest, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }
        else{
            
        }*/
    }
    
    
}

function getPos(roomPos){
    var result = new Object();
    result.x = roomPos.x;
    result.y = roomPos.y;
    result.roomName = roomPos.roomName;
    return result;
}
module.exports = roleWorker;