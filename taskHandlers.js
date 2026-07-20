var tasks = require('tasks.index');

module.exports = {
    run: function (type, creep, task) {
        return tasks.run(type, creep, task);
    },
    tasks: tasks,
};
