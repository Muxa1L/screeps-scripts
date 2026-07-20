var TaskType = require('taskBaseClass');
var taskBase = require('taskBase');
var move = require('moveUtil');

var UPGRADE_CRITICAL_THRESHOLD = 3000;
var UPGRADE_URGENT_THRESHOLD = 1500;
var UPGRADE_EMERGENCY_THRESHOLD = 500;

function upgradePriority(snapshot) {
    if (!snapshot || !snapshot.controller) return taskBase.PRIORITY.UPGRADE;
    var c = snapshot.controller;
    if (c.safeModeActive && c.safeModeActive > 0) {
        return taskBase.PRIORITY.UPGRADE_EMERGENCY;
    }
    var ttd = c.ticksToDowngrade;
    if (ttd === undefined || ttd === null) return taskBase.PRIORITY.UPGRADE;
    if (ttd < UPGRADE_EMERGENCY_THRESHOLD) return 1;
    if (ttd < UPGRADE_URGENT_THRESHOLD) return 5;
    if (ttd < UPGRADE_CRITICAL_THRESHOLD) return taskBase.PRIORITY.SWEEP;
    return taskBase.PRIORITY.UPGRADE;
}

module.exports = new TaskType({
    type: 'upgrade',
    priority: taskBase.PRIORITY.UPGRADE,
    cap: 4,
    canDo: function (creep) {
        return creep.getActiveBodyparts(WORK) > 0 && creep.getActiveBodyparts(CARRY) > 0;
    },
    priorityFor: upgradePriority,
    tasks: function (room, snap) {
        if (room.controller && room.controller.my) {
            return [{ target: room.controller }];
        }
        return [];
    },
    run: function (creep, task) {
        var controller = task.target;
        if (!controller) return false;
        if (creep.carry.energy === 0) return false;
        var res = creep.upgradeController(controller);
        if (res === ERR_NOT_IN_RANGE) {
            move.action(creep, 'moving->upgrade');
            move.moveCreep(creep, controller, { visualizePathStyle: { stroke: '#ffffff' } });
            return true;
        }
        move.action(creep, 'upgrading');
        return true;
    },
});

