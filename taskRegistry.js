var taskBase = require('taskBase');

var tasks = {
    list: function (room) {
        if (!room) return [];
        var snapshot = require('roomManager').get(room.name);
        if (!snapshot) return [];

        var result = [];
        var hostiles = snapshot.hostiles;
        var damagedFriendlies = snapshot.damagedFriendlies;
        var constructionSites = snapshot.constructionSites;
        var dropped = snapshot.droppedEnergy;
        var tombstones = snapshot.tombstones;
        var ruins = snapshot.ruins;
        var damagedCritical = snapshot.damagedCritical;
        var damagedNonCritical = snapshot.damagedNonCritical;
        var sources = snapshot.sources;
        var extensions = snapshot.energyStructures;
        var hasContainer = snapshot.containers.length > 0;
        var controller = room.controller;

        for (var i = 0; i < hostiles.length; i++) {
            result.push({
                id: taskBase.makeId('defend', room.name, hostiles[i].id),
                type: 'defend',
                priority: taskBase.PRIORITY.DEFEND,
                target: hostiles[i],
                roomName: room.name,
            });
        }

        for (var j = 0; j < damagedFriendlies.length; j++) {
            result.push({
                id: taskBase.makeId('heal', room.name, damagedFriendlies[j].id),
                type: 'heal',
                priority: taskBase.PRIORITY.HEAL,
                target: damagedFriendlies[j],
                roomName: room.name,
            });
        }

        var needsEnergy = extensions.length > 0;
        for (var k = 0; k < dropped.length; k++) {
            result.push({
                id: taskBase.makeId('sweep', room.name, 'drop:' + dropped[k].id),
                type: 'sweep',
                priority: taskBase.PRIORITY.SWEEP,
                target: dropped[k],
                roomName: room.name,
            });
        }
        for (var t = 0; t < tombstones.length; t++) {
            var tomb = tombstones[t];
            if (_.sum(tomb.store) > 10) {
                result.push({
                    id: taskBase.makeId('sweep', room.name, 'tomb:' + tomb.id),
                    type: 'sweep',
                    priority: taskBase.PRIORITY.SWEEP,
                    target: tomb,
                    roomName: room.name,
                });
            }
        }
        for (var r = 0; r < ruins.length; r++) {
            var ruin = ruins[r];
            if (_.sum(ruin.store) > 10) {
                result.push({
                    id: taskBase.makeId('sweep', room.name, 'ruin:' + ruin.id),
                    type: 'sweep',
                    priority: taskBase.PRIORITY.SWEEP,
                    target: ruin,
                    roomName: room.name,
                });
            }
        }

        if (hasContainer && needsEnergy) {
            for (var cc = 0; cc < snapshot.containers.length; cc++) {
                var cont = snapshot.containers[cc];
                if (cont.store[RESOURCE_ENERGY] >= 50) {
                    result.push({
                        id: taskBase.makeId('haul', room.name, cont.id),
                        type: 'haul',
                        priority: taskBase.PRIORITY.HAUL,
                        target: cont,
                        roomName: room.name,
                    });
                }
            }
        }

        for (var dc = 0; dc < damagedCritical.length; dc++) {
            result.push({
                id: taskBase.makeId('repair', room.name, 'crit:' + damagedCritical[dc].id),
                type: 'repair',
                priority: taskBase.PRIORITY.REPAIR_CRITICAL,
                target: damagedCritical[dc],
                roomName: room.name,
            });
        }
        for (var cs = 0; cs < constructionSites.length; cs++) {
            result.push({
                id: taskBase.makeId('build', room.name, constructionSites[cs].id),
                type: 'build',
                priority: taskBase.PRIORITY.BUILD,
                target: constructionSites[cs],
                roomName: room.name,
            });
        }
        for (var dn = 0; dn < damagedNonCritical.length; dn++) {
            result.push({
                id: taskBase.makeId('repair', room.name, damagedNonCritical[dn].id),
                type: 'repair',
                priority: taskBase.PRIORITY.REPAIR,
                target: damagedNonCritical[dn],
                roomName: room.name,
            });
        }

        if (controller && controller.my) {
            result.push({
                id: taskBase.makeId('upgrade', room.name, controller.id),
                type: 'upgrade',
                priority: taskBase.PRIORITY.UPGRADE,
                target: controller,
                roomName: room.name,
            });
        }

        for (var s = 0; s < sources.length; s++) {
            result.push({
                id: taskBase.makeId('mine', room.name, sources[s].id),
                type: 'mine',
                priority: taskBase.PRIORITY.MINE,
                target: sources[s],
                roomName: room.name,
            });
            result.push({
                id: taskBase.makeId('harvest', room.name, sources[s].id),
                type: 'harvest',
                priority: taskBase.PRIORITY.HARVEST,
                target: sources[s],
                roomName: room.name,
            });
        }

        return result;
    },
};

module.exports = tasks;
