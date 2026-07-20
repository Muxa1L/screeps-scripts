const tasks = require('tasksIndex');
const roomManager = require('roomManager');

module.exports = {
    list: function (room) {
        if (!room) return [];
        const snap = roomManager.get(room.name);
        if (!snap) return [];
        return tasks.list(room, snap);
    },
};
