'use strict';

// Nuke detection — scans owned rooms for incoming nukes (FIND_NUKES),
// triggers safe mode when timeToLand is critical, sets evacuation flags
// for non-combat creeps, and cleans up stale events.

const constants = require('../../config/constants');
const memory = require('../../utils/memorySchema');

const NUKE_SAFE_MODE_TICKS = constants.NUKE_SAFE_MODE_TICKS;
const NUKE_EVENT_TTL = constants.NUKE_EVENT_TTL;

function tick() {
    const nuke = memory.ensureNuke();
    for (const rn in Game.rooms) {
        const room = Game.rooms[rn];
        const controller = room.controller;
        if (!controller || !controller.my) continue;

        const nukes = room.find(FIND_NUKES);
        if (nukes.length === 0) {
            // No nukes — clear any stale evac flag for this room
            if (nuke.evacuating[rn]) {
                memory.clearNukeEvac(rn);
            }
            continue;
        }

        for (let i = 0; i < nukes.length; i++) {
            const n = nukes[i];
            const timeToLand = n.timeToLand;

            // Record the event
            nuke.events[rn] = {
                detectedTick: Game.time,
                pos: { x: n.pos.x, y: n.pos.y },
                timeToLand: timeToLand,
                launchRoomName: n.launchRoomName || null,
                safeModeActivated: false,
            };
            nuke.stat.nukesDetected++;

            // Trigger safe mode if landing soon and safe mode is available
            if (timeToLand < NUKE_SAFE_MODE_TICKS &&
                controller.safeModeAvailable > 0 &&
                !controller.safeMode &&
                !controller.safeModeCooldown) {
                const res = controller.activateSafeMode();
                if (res === OK) {
                    nuke.events[rn].safeModeActivated = true;
                    nuke.stat.safeModeTriggered++;
                    console.log('[' + Game.time + '] [nuke] [' + rn + '] safe mode activated for nuke @' +
                        n.pos.x + ',' + n.pos.y + ' timeToLand=' + timeToLand);
                } else {
                    console.log('[' + Game.time + '] [nuke] [' + rn + '] safe mode failed: ' + res);
                }
            }

            // Set evacuation flag for non-combat creeps
            if (timeToLand < NUKE_SAFE_MODE_TICKS) {
                if (!nuke.evacuating[rn]) {
                    nuke.evacuating[rn] = true;
                    nuke.stat.roomsEvacuated++;
                    console.log('[' + Game.time + '] [nuke] [' + rn + '] evacuation ordered');
                }
            }
        }
    }

    // Clean up stale events
    for (const rn in nuke.events) {
        const ev = nuke.events[rn];
        if (Game.time - ev.detectedTick > NUKE_EVENT_TTL) {
            delete nuke.events[rn];
        }
    }
}

module.exports = {
    tick: tick,
};