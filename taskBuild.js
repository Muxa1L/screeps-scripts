const TaskType = require('taskBaseClass');
const taskBase = require('taskBase');
const move = require('moveUtil');

module.exports = new TaskType({
    type: 'build',
    priority: taskBase.PRIORITY.BUILD,
    cap: 2,
    canDo: function (creep) {
        return creep.getActiveBodyparts(WORK) > 0 && creep.getActiveBodyparts(CARRY) > 0;
    },
    tasks: function (room, snap) {
        return snap.constructionSites.map(function (s) { return { target: s }; });
    },
    score: function (creep, target) {
        return taskBase.pathScore(creep, target);
    },
    run: function (creep, task) {
        const site = task.target;
        if (!site) return false;
        if (creep.store[RESOURCE_ENERGY] === 0) return false;
        const res = creep.build(site);
        if (res === ERR_NOT_IN_RANGE) {
            move.action(creep, 'moving->build@' + site.id);
            move.moveCreep(creep, site, { visualizePathStyle: { stroke: '#ffffff' } });
            return true;
        }
        move.action(creep, 'building@' + site.id);
        if (res === OK && site.progressTotal - site.progress <= creep.getActiveBodyparts(WORK) * BUILD_POWER) {
            return false;
        }
        return true;
    },
});
