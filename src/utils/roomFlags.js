'use strict';

const HAUL_FLAG_PREFIX = 'haul:';
const ROOM_ALLOW_PREFIX = 'room_allow:';
const BUILD_FLAG_PREFIX = 'build:';

function isHaulFlag(name) {
    return name && name.toLowerCase().startsWith(HAUL_FLAG_PREFIX);
}

function isBuildFlag(name) {
    return name && name.toLowerCase().startsWith(BUILD_FLAG_PREFIX);
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

let _containerTick = -1;
let _containerCache = {};
// Cached per tick per room. Called per-creep from energyService/depositService/
// taskHaul; mirrors the getPrioritySiteIds cache pattern below.
function getPriorityContainerIds(roomName) {
    if (_containerTick !== Game.time) {
        _containerTick = Game.time;
        _containerCache = {};
    }
    if (_containerCache[roomName] !== undefined) return _containerCache[roomName];
    const containers = getPriorityContainers(roomName);
    const ids = {};
    for (let i = 0; i < containers.length; i++) {
        ids[containers[i].id] = true;
    }
    _containerCache[roomName] = ids;
    return ids;
}

let _buildSiteTick = -1;
let _buildSiteCache = {};
// Returns a set of construction-site IDs at `build:<x>` flag positions in the
// given room. Place a `build:` flag on a construction site to make builders
// prefer it over other sites. Cached per tick per room since taskBuild.score
// calls this for every build candidate.
function getPrioritySiteIds(roomName) {
    if (_buildSiteTick !== Game.time) {
        _buildSiteTick = Game.time;
        _buildSiteCache = {};
    }
    if (_buildSiteCache[roomName] !== undefined) return _buildSiteCache[roomName];
    const ids = {};
    for (const name in Game.flags) {
        const flag = Game.flags[name];
        if (!isBuildFlag(flag.name)) continue;
        if (roomName && flag.pos.roomName !== roomName) continue;
        const sites = flag.pos.lookFor(LOOK_CONSTRUCTION_SITES);
        for (let i = 0; i < sites.length; i++) {
            ids[sites[i].id] = true;
        }
    }
    _buildSiteCache[roomName] = ids;
    return ids;
}

module.exports = {
    getPriorityContainers: getPriorityContainers,
    getPriorityContainerIds: getPriorityContainerIds,
    getPrioritySiteIds: getPrioritySiteIds,
    getAllowedRooms: getAllowedRooms,
};
