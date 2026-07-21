const constants = require('../../config/constants');
const assert = require('../../utils/assert');

const GHOST_CRITICAL_AGE = constants.GHOST_CRITICAL_AGE;

function runWatchdog() {
    if (!Memory.creeps) return;
    if (Game.time % 50 !== 0) return;
    let maxAge = 0;
    for (const cname in Memory.creeps) {
        if (Game.creeps[cname]) continue;
        const diedAt = Memory.creeps[cname]._diedAt || 0;
        const age = Game.time - diedAt;
        if (age > maxAge) maxAge = age;
    }
    if (maxAge > GHOST_CRITICAL_AGE) {
        assert.recordError('memoryWatchdog', {
            message: 'critical: ghost creep age ' + maxAge + ' exceeds ' + GHOST_CRITICAL_AGE,
        });
    }
}

module.exports = {
    runWatchdog: runWatchdog,
};
