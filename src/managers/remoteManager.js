const memory = require('../utils/memorySchema');
const constants = require('../config/constants');

const REMOTE_MAX_DISTANCE = constants.REMOTE_MAX_DISTANCE;
const REMOTE_MIN_STORAGE_RATIO = constants.REMOTE_MIN_STORAGE_RATIO;
const REMOTE_MAX_ROOMS = constants.REMOTE_MAX_ROOMS;
const REMOTE_THREAT_STALE_TICKS = constants.REMOTE_THREAT_STALE_TICKS;
const REMOTE_ABANDON_TICKS = constants.REMOTE_ABANDON_TICKS;

function homeRoomForRemote(remoteRoomName) {
    // For v1 assume the closest owned room by linear distance.
    let best = null;
    let bestDist = Infinity;
    for (const name in Game.rooms) {
        const room = Game.rooms[name];
        if (!room.controller || !room.controller.my) continue;
        const dist = Game.map.getRoomLinearDistance(name, remoteRoomName);
        if (dist < bestDist) {
            bestDist = dist;
            best = name;
        }
    }
    return best;
}

function ownedRoomCount() {
    let count = 0;
    for (const name in Game.rooms) {
        if (Game.rooms[name].controller && Game.rooms[name].controller.my) count++;
    }
    return count;
}

function canActivate(remoteRoomName) {
    // Cap total remote rooms.
    const rr = memory.getRemoteRooms();
    let active = 0;
    for (const name in rr) {
        if (rr[name].status !== 'abandoned') active++;
    }
    if (active >= REMOTE_MAX_ROOMS + ownedRoomCount()) return false;
    // Distance gate.
    const home = homeRoomForRemote(remoteRoomName);
    if (!home) return false;
    if (Game.map.getRoomLinearDistance(home, remoteRoomName) > REMOTE_MAX_DISTANCE) return false;
    // Storage gate for home room.
    const homeRoomObj = Game.rooms[home];
    if (homeRoomObj && homeRoomObj.storage) {
        const ratio = (homeRoomObj.storage.store[RESOURCE_ENERGY] || 0) /
            homeRoomObj.storage.store.getCapacity(RESOURCE_ENERGY);
        if (ratio < REMOTE_MIN_STORAGE_RATIO) return false;
    }
    return true;
}

function ensureRemoteRoom(roomName) {
    const rr = memory.ensureRemoteRooms();
    if (!rr[roomName]) {
        rr[roomName] = {
            target: roomName,
            status: 'pending',
            scoutedTick: 0,
            reservationExpires: 0,
            sourceIds: [],
            containerSiteIds: [],
            containerIds: [],
            roadSiteIds: [],
            threats: [],
            homeRoom: homeRoomForRemote(roomName),
        };
    }
    return rr[roomName];
}

function pruneThreats(entry) {
    const now = Game.time;
    const fresh = [];
    for (let i = 0; i < (entry.threats || []).length; i++) {
        if (now - entry.threats[i].detectedTick < REMOTE_THREAT_STALE_TICKS) fresh.push(entry.threats[i]);
    }
    entry.threats = fresh;
}

function updateThreats(entry) {
    const room = Game.rooms[entry.target];
    if (!room) return;
    const hostiles = room.find(FIND_HOSTILE_CREEPS);
    // Dedupe by creep id and cap the threat list to avoid unbounded growth
    // (one entry per hostile detected in the last REMOTE_THREAT_STALE_TICKS).
    const existingById = {};
    for (let i = 0; i < (entry.threats || []).length; i++) {
        existingById[entry.threats[i].creepId] = entry.threats[i];
    }
    for (let i = 0; i < hostiles.length; i++) {
        const h = hostiles[i];
        if (existingById[h.id]) {
            // Refresh detection tick and hits for an ongoing threat.
            existingById[h.id].detectedTick = Game.time;
            existingById[h.id].hits = h.hits;
        } else {
            entry.threats.push({
                creepId: h.id,
                hits: h.hits,
                type: 'hostile',
                detectedTick: Game.time,
            });
            existingById[h.id] = entry.threats[entry.threats.length - 1];
        }
    }
    if (hostiles.length > 0) {
        entry.status = 'contested';
    } else if (entry.status === 'contested') {
        // Require clear period before returning to active.
        const lastThreat = entry.threats.length > 0 ? entry.threats[entry.threats.length - 1].detectedTick : Game.time;
        if (Game.time - lastThreat > 100) entry.status = 'active';
    }
}

function queueConstruction(entry) {
    const room = Game.rooms[entry.target];
    if (!room) return;
    // Queue a container near each source. Store real construction-site ids so
    // downstream code can look them up instead of parsing "x,y" strings.
    for (let i = 0; i < (entry.sourceIds || []).length; i++) {
        const source = Game.getObjectById(entry.sourceIds[i]);
        if (!source) continue;
        const pos = source.pos;
        const candidates = [
            new RoomPosition(pos.x + 1, pos.y, room.name),
            new RoomPosition(pos.x - 1, pos.y, room.name),
            new RoomPosition(pos.x, pos.y + 1, room.name),
            new RoomPosition(pos.x, pos.y - 1, room.name),
        ];
        for (let j = 0; j < candidates.length; j++) {
            const res = candidates[j].createConstructionSite(STRUCTURE_CONTAINER);
            if (res === OK) {
                // Look up the freshly-created site by position + structureType.
                const sites = room.find(FIND_CONSTRUCTION_SITES, {
                    filter: function (s) {
                        return s.structureType === STRUCTURE_CONTAINER &&
                            s.pos.x === candidates[j].x && s.pos.y === candidates[j].y;
                    },
                });
                if (sites.length > 0) {
                    entry.containerSiteIds.push(sites[0].id);
                } else {
                    // Site couldn't be found (RCL/hostile/already exists); record
                    // a placeholder so we don't retry the same source next tick.
                    entry.containerSiteIds.push(candidates[j].x + ',' + candidates[j].y);
                }
                break;
            }
        }
    }
}

function tick() {
    if (!Memory.flags || !Memory.flags.remoteMining) return;
    const rr = memory.ensureRemoteRooms();

    // Pull in manual flags for v1. A RemoteTarget<n> flag creates (but does
    // not activate) the remote-room entry; canActivate still gates whether
    // the scout is dispatched.
    if (Game.flags) {
        for (const name in Game.flags) {
            if (name.indexOf('RemoteTarget') !== 0) continue;
            const roomName = Game.flags[name].pos.roomName;
            ensureRemoteRoom(roomName);
        }
    }

    for (const name in rr) {
        const entry = rr[name];
        pruneThreats(entry);
        updateThreats(entry);
        if (entry.status === 'abandoned') continue;

        // `pending` rooms stay pending until the prerequisites are met; the
        // scout task picks them up when canActivate returns true. The flag
        // loop above already created the entry, so there's nothing to do
        // here besides leaving the status alone.

        if (entry.status === 'scouted') {
            entry.status = 'reserving';
        }

        if (entry.status === 'reserved') {
            if ((entry.containerSiteIds || []).length === 0 && (entry.containerIds || []).length === 0) {
                queueConstruction(entry);
                entry.status = 'building';
            }
        }

        if (entry.status === 'building') {
            const room = Game.rooms[name];
            if (room) {
                const containers = room.find(FIND_STRUCTURES, {
                    filter: function (s) { return s.structureType === STRUCTURE_CONTAINER; },
                });
                if (containers.length > 0) {
                    entry.containerIds = containers.map(function (c) { return c.id; });
                    entry.containerSiteIds = [];
                    entry.roadSiteIds = [];
                    entry.status = 'active';
                }
            }
        }

        // Abandon if reservation lapsed and no threats for a long time.
        if ((entry.status === 'reserved' || entry.status === 'active') &&
            Game.time - (entry.reservationExpires || Game.time) > REMOTE_ABANDON_TICKS &&
            entry.threats.length === 0) {
            entry.status = 'abandoned';
        }
    }
}

module.exports = {
    tick: tick,
    ensureRemoteRoom: ensureRemoteRoom,
    canActivate: canActivate,
    homeRoomForRemote: homeRoomForRemote,
    queueConstruction: queueConstruction,
};
