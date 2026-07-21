'use strict';

const HAUL_FLAG_PREFIX = 'haul:';

function isHaulFlag(name) {
    return name && name.toLowerCase().startsWith(HAUL_FLAG_PREFIX);
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
};
