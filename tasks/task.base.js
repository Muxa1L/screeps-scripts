var taskBase = require('taskBase');
var move = require('utils.move');

function TaskType(spec) {
    this.type = spec.type;
    this.priority = spec.priority;
    this.cap = spec.cap || 99;
    this.canDo = spec.canDo || function () { return true; };
    this.tasks = spec.tasks || function () { return []; };
    this.run = spec.run || function () { return true; };
    this.describe = spec.describe || taskBase.describeTask;
}

TaskType.prototype.score = function (creep, target) {
    return taskBase.approxDistance(creep, target);
};

TaskType.prototype.listFor = function (room, snapshot) {
    var list = this.tasks(room, snapshot) || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
        var t = list[i];
        if (!t || !t.target) continue;
        out.push(taskBase.makeTask(this.type, this.priority, t.target, room.name));
    }
    return out;
};

module.exports = TaskType;
