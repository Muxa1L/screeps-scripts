var roleFighter = {

    /** @param {Creep} creep **/
    run: function(creep) {
        var enemies = creep.room.find(FIND_HOSTILE_CREEPS);
        if (enemies.length > 0){
            if (!creep.memory.targetId){
                var tgt = creep.pos.findClosestByPath(enemies, {
                    filter: function(object) {
                        return object.getActiveBodyparts(ATTACK) != 0 || object.getActiveBodyparts(RANGED_ATTACK) != 0;
                    }
                });
                if (tgt){
                    creep.memory.targetId = tgt.id;
                }
                else {
                    creep.memory.targetId = enemies[0].id
                }
            }
            var target = Game.getObjectById(creep.memory.targetId);
            switch (creep.attack(target)){
                case ERR_NOT_IN_RANGE:
                    creep.moveTo(target);
                    break;
                case ERR_NO_BODYPART:
                    creep.memory.role = 'disabled';
                    break;
            }
            if (target.getActiveBodyparts(ATTACK) == 0 && target.getActiveBodyparts(RANGED_ATTACK) == 0){
                creep.memory.targetId = null;
            }
        }
        else {
            var flag = Game.flags["Fighters"];
            if (!creep.pos.isNearTo(flag)){
                creep.moveTo(flag);
            }
        }
	}
};

module.exports = roleFighter;