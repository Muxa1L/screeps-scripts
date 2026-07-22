'use strict';

const HAUL_FLAG_PREFIX = 'haul:';
const ROOM_ALLOW_PREFIX = 'room_allow:';

function isHaulFlag(name) {
    return name && name.toLowerCase().startsWith(HAUL_FLAG_PREFIX);
}

let _allowedCache = {};
let _allowedTick = -1;

// Returns a set of room names whitelisted via `room_allow:<room>` flags.
// A non-combat creep in one of these rooms is allowed to stay and take
// tasks (e.g. remote harvest) instead of being sent home. The flag may
// be placed in any room; the allowed room name is parsed from the flag
// name itself.
function getAllowedRooms() {
    if (_allowedTick !== Game.time) {
        _allowedTick = Game.time;
        _allowedCache = {};
        for (const name in Game.flags) {
            const lower = name.toLowerCase();
            if (!lower.startsWith(ROOM_ALLOW_PREFIX)) continue;
            const roomName = name.slice(ROOM_ALLOW_PREFIX.length);
            if (roomName) _allowedCache[roomName] = true;
        }
    }
    return _allowedCache;
}

function getPriorityContainers(roomName) {
    const out = [];
    for (const name in Game.flags) {
        const flag = Game.flags[name];
        if (!isHaulFlag(flag.name)) continue;
        if (roomName && flag.pos.roomName !== roomName) continue;
        const structs = flag.pos.lookFor(LOOK_STRUCTURES);
        for (let i = 0; i < structs.length; i++) {
            if (structs[i].structureType === STRUCTURE_CONTAINER) {
                out.push(structs[i]);
                break;
            }
        }
    }
    return out;
}

function getPriorityContainerIds(roomName) {
    const containers = getPriorityContainers(roomName);
    const ids = {};
    for (let i = 0; i < containers.length; i++) {
        ids[containers[i].id] = true;
    }
    return ids;
}

module.exports = {
    getPriorityContainers: getPriorityContainers,
    getPriorityContainerIds: getPriorityContainerIds,
    getAllowedRooms: getAllowedRooms,
};
