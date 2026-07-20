var tasks = require('tasksIndex');
var roomManager = require('roomManager');

module.exports = {
    list: function (room) {
        if (!room) return [];
        var snap = roomManager.get(room.name);
        if (!snap) return [];
        return tasks.list(room, snap);
    },
};
