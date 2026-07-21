const constants = require('../../config/constants');
const assert = require('../../utils/assert');

const GHOST_CRITICAL_AGE = constants.GHOST_CRITICAL_AGE;

function runWatchdog() {
    if (!Memory.creeps) return;
    if (Game.time % 50 !== 0) return;
    let ghostCount = 0;
    for (const cname in Memory.creeps) {
        if (Game.creeps[cname]) continue;
        ghostCount++;
    }
    if (ghostCount > GHOST_CRITICAL_AGE) {
        assert.recordError('memoryWatchdog', {
            message: 'critical: ' + ghostCount + ' ghost creeps in memory after ' + GHOST_CRITICAL_AGE + '+ ticks',
        });
    }
}

module.exports = {
    runWatchdog: runWatchdog,
};
