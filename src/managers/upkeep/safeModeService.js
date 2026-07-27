const constants = require('../../config/constants');
const memory = require('../../utils/memorySchema');
const spawnUtil = require('../../utils/spawnUtil');
const roomManager = require('../roomManager');

const SAFE_MODE_TRIGGER_RATIO = constants.SAFE_MODE_TRIGGER_RATIO;
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
        const snap = roomManager.get(rn);
        const hostileCount = snap ? snap.hostiles.length : room.find(FIND_HOSTILE_CREEPS).length;
        // Only treat spawn damage as an emergency during an active attack.
        // Without this gate a spawn scratched by a hostile that already left
        // would burn a safe-mode charge for nothing. The ratio (not absolute
        // hits) keeps safe mode from firing on the first scratch — towers /
        // fighters get time to handle minor incursions first.
        let lowHealth = false;
        if (hostileCount > 0) {
            for (let i = 0; i < spawnsHere.length; i++) {
                const sp = spawnsHere[i];
                if (sp.hits < sp.hitsMax * SAFE_MODE_TRIGGER_RATIO) { lowHealth = true; break; }
            }
        }
        const ttd = controller.ticksToDowngrade;
        const lowTtd = typeof ttd === 'number' && ttd < SAFE_MODE_TTD_THRESHOLD && hostileCount > 0;

        const lastSafeMode = memory.getRoomMemory(rn)[SAFE_MODE_MEMORY_KEY] || 0;
        const cooldownClear = !controller.safeModeCooldown && Game.time - lastSafeMode > SAFE_MODE_COOLDOWN_TICKS;
        if ((lowHealth || lowTtd) &&
            controller.safeModeAvailable > 0 &&
            !controller.safeMode &&
            cooldownClear) {
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
