'use strict';

// Per-module CPU tracking and periodic console dashboard.
// assert.safeRunTimed wraps top-level module calls and records CPU deltas
// into _perModule. Every 100 ticks, aggregate() pushes the accumulated
// data into Memory.stats.cpuByModule (120-sample ring buffer) and logTable()
// prints an ASCII breakdown to the console.

const STATS_INTERVAL = 100;
const STATS_MAX_SAMPLES = 120;

let _tick = -1;
let _perModule = {};

function tickStart() {
    if (_tick === Game.time) return;
    _tick = Game.time;
    _perModule = {};
}

function recordModule(module, usedMs) {
    _perModule[module] = (_perModule[module] || 0) + usedMs;
}

function snapshot() {
    const total = Object.keys(_perModule).reduce(function (sum, k) {
        return sum + _perModule[k];
    }, 0);
    return { modules: _perModule, total: total };
}

function aggregate() {
    if (!Memory.stats) Memory.stats = {};
    if (!Memory.stats.cpuByModule) Memory.stats.cpuByModule = {};
    for (const m in _perModule) {
        if (!Memory.stats.cpuByModule[m]) Memory.stats.cpuByModule[m] = [];
        Memory.stats.cpuByModule[m].push({ tick: Game.time, ms: _perModule[m] });
        if (Memory.stats.cpuByModule[m].length > STATS_MAX_SAMPLES) {
            Memory.stats.cpuByModule[m].shift();
        }
    }
    // Reset for the next window
    _perModule = {};
    _tick = Game.time;
}

function logTable() {
    if (Game.time % STATS_INTERVAL !== 0) return;
    const snap = snapshot();
    if (snap.total === 0) return;
    const lines = [];
    lines.push('[' + Game.time + '] [stats] CPU breakdown (last ' + STATS_INTERVAL + 't):');
    lines.push('  total=' + snap.total.toFixed(2) + 'ms  bucket=' + Game.cpu.bucket);
    // Sort modules by CPU descending
    const sorted = Object.keys(snap.modules).sort(function (a, b) {
        return snap.modules[b] - snap.modules[a];
    });
    for (let i = 0; i < sorted.length; i++) {
        const m = sorted[i];
        const pct = (snap.modules[m] / snap.total * 100).toFixed(1);
        lines.push('    ' + m.padEnd(20) + snap.modules[m].toFixed(2).padStart(8) + 'ms  (' + pct + '%)');
    }
    console.log(lines.join('\n'));
}

// GCL/RCL progression tracking. Called from logTable every 100 ticks.
function recordProgression() {
    if (Game.time % STATS_INTERVAL !== 0) return;
    if (!Memory.stats) Memory.stats = {};
    if (!Memory.stats.rclHistory) Memory.stats.rclHistory = {};
    for (const rn in Game.rooms) {
        const r = Game.rooms[rn];
        if (!r.controller || !r.controller.my) continue;
        const prev = Memory.stats.rclHistory[rn];
        if (prev) {
            const dp = r.controller.progress - prev.progress;
            const dt = Game.time - prev.tick;
            if (dt > 0 && dp > 0) {
                console.log('[' + Game.time + '] [stats] ' + rn + ' RCL' + r.controller.level +
                    ' +' + (dp / dt).toFixed(1) + ' ep/t (' + (dp / 1000).toFixed(0) + 'k/' +
                    (r.controller.progressTotal / 1000).toFixed(0) + 'k)');
            }
        }
        Memory.stats.rclHistory[rn] = {
            tick: Game.time,
            progress: r.controller.progress,
            level: r.controller.level,
        };
    }
}

function tick() {
    logTable();
    recordProgression();
    // aggregate runs at the end of each 100-tick window
    if (Game.time % STATS_INTERVAL === 0) {
        aggregate();
    }
}

module.exports = {
    tickStart: tickStart,
    recordModule: recordModule,
    snapshot: snapshot,
    aggregate: aggregate,
    logTable: logTable,
    recordProgression: recordProgression,
    tick: tick,
    STATS_INTERVAL: STATS_INTERVAL,
    STATS_MAX_SAMPLES: STATS_MAX_SAMPLES,
};