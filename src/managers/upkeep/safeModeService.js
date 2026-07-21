const constants = require('../../config/constants');
const memory = require('../../utils/memorySchema');
const spawnUtil = require('../../utils/spawnUtil');
const roomManager = require('../roomManager');

const SAFE_MODE_TRIGGER_HITS = constants.SAFE_MODE_TRIGGER_HITS;
const SAFE_MODE_TTD_THRESHOLD = constants.SAFE_MODE_TTD_THRESHOLD;
const SAFE_MODE_COOLDOWN_TICKS = constants.SAFE_MODE_COOLDOWN_TICKS;
const SAFE_MODE_MEMORY_KEY = 'lastSafeModeActivate';

function runSafeMode() {
    for (const rn in Game.rooms) {
        const room = Game.rooms[rn];
        const controller = room.controller;
        if (!controller || !controller.my) continue;
        const spawnsHere = spawnUtil.spawnsInRoom(room);
        if (spawnsHere.length === 0) continue;
        let lowHealth = false;
        for (let i = 0; i < spawnsHere.length; i++) {
            if (spawnsHere[i].hits < SAFE_MODE_TRIGGER_HITS) { lowHealth = true; break; }
        }
        const snap = roomManager.get(rn);
        const hostileCount = snap ? snap.hostiles.length : room.find(FIND_HOSTILE_CREEPS).length;
        const ttd = controller.ticksToDowngrade;
        const lowTtd = typeof ttd === 'number' && ttd < SAFE_MODE_TTD_THRESHOLD && hostileCount > 0;

        const lastSafeMode = memory.getRoomMemory(rn)[SAFE_MODE_MEMORY_KEY] || 0;
        if ((lowHealth || lowTtd) &&
            controller.safeModeAvailable > 0 &&
            !controller.safeMode &&
            Game.time - lastSafeMode > SAFE_MODE_COOLDOWN_TICKS) {
            const res = controller.activateSafeMode();
            if (res === OK) {
                memory.getRoomMemory(rn)[SAFE_MODE_MEMORY_KEY] = Game.time;
                console.log('[' + Game.time + '] [safe-mode] [' + rn + '] activate -> ' + res + (lowTtd ? ' (ttd=' + ttd + ')' : ' (spawn-low)'));
            } else if (Game.time % 100 === 0) {
                console.log('[' + Game.time + '] [safe-mode] [' + rn + '] activate -> ' + res);
            }
        }
    }
}

module.exports = {
    runSafeMode: runSafeMode,
};
