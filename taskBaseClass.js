const taskBase = require('taskBase');


function TaskType(spec) {
    this.type = spec.type;
    this.priority = spec.priority;
    this.cap = spec.cap || 99;
    this.canDo = spec.canDo || function () { return true; };
    this.tasks = spec.tasks || function () { return []; };
    this.run = spec.run || function () { return true; };
    this.describe = spec.describe || taskBase.describeTask;
    this.priorityFor = spec.priorityFor || function (_snapshot) { return this.priority; };
}

TaskType.prototype.score = function (creep, target) {
    return taskBase.approxDistance(creep, target);
};

TaskType.prototype.listFor = function (room, snapshot) {
    const list = this.tasks(room, snapshot) || [];
    const priority = this.priorityFor(snapshot);
    const out = [];
    for (let i = 0; i < list.length; i++) {
        const t = list[i];
        if (!t || !t.target) continue;
        out.push(taskBase.makeTask(this.type, priority, t.target, room.name));
    }
    return out;
};

module.exports = TaskType;
