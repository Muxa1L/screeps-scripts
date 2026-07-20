var tasks = require('tasksIndex');

module.exports = {
    run: function (type, creep, task) {
        return tasks.run(type, creep, task);
    },
    tasks: tasks,
};
