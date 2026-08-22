// RoomVisual dashboard: draws economy status per owned room — source mining
// status, creep role counts, storage/links/towers energy bars. Cheap: only
// draws every 10 ticks and uses plain text/primitive rects.

const MEMORY_KEY = '_viz';

function shouldDraw() {
    return Game.time % 10 === 0;
}

function bar(vis, x, y, width, ratio, color, label) {
    const w = Math.max(0, Math.min(1, ratio)) * width;
    vis.rect(x - 0.05, y - 0.15, width + 0.1, 0.3, {
        fill: '#222222', opacity: 0.6, stroke: '#555555', strokeWidth: 0.03,
    });
    if (w > 0) {
        vis.rect(x, y - 0.12, w, 0.24, { fill: color, opacity: 0.85 });
    }
    vis.text(label, x + width / 2, y + 0.02, {
        color: '#ffffff', font: 0.5, align: 'center', opacity: 0.95,
    });
}

function drawRoom(room) {
    const vis = room.visual;
    const lines = [];

    // --- Header: RCL + progress ---
    const ctrl = room.controller;
    const rclPct = ctrl.progressTotal ? (ctrl.progress / ctrl.progressTotal) : 0;
    vis.text('RCL ' + ctrl.level + '  ' + Math.floor(rclPct * 100) + '%', 2, 1.2, {
        color: '#7fff7f', font: 0.8, align: 'left',
    });

    // --- Energy bars (storage / spawn+ext / towers) ---
    let y = 2;
    const W = 7;
    if (room.storage) {
        const e = room.storage.store[RESOURCE_ENERGY] || 0;
        bar(vis, 3, y, W, e / room.storage.store.getCapacity(RESOURCE_ENERGY), '#ffd700',
            'STO ' + e);
        y += 0.9;
    }
    const spawns = room.find(FIND_MY_SPAWNS);
    let structE = 0;
    let structCap = 0;
    for (const s of spawns) { structE += s.energy; structCap += s.energyCapacity; }
    const exts = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_EXTENSION } });
    for (const s of exts) { structE += s.energy; structCap += s.energyCapacity; }
    bar(vis, 3, y, W, structCap ? structE / structCap : 0, '#88bbff',
        'SPAWN ' + structE + '/' + structCap);
    y += 0.9;

    const towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });
    if (towers.length > 0) {
        let tE = 0;
        let tC = 0;
        for (const t of towers) { tE += t.energy; tC += t.energyCapacity; }
        bar(vis, 3, y, W, tE / tC, '#ff6644', 'TOWER ' + tE + '/' + tC);
        y += 0.9;
    }

    // --- Links ---
    const links = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_LINK } });
    for (let i = 0; i < links.length && i < 3; i++) {
        const l = links[i];
        bar(vis, 3, y, W, l.store[RESOURCE_ENERGY] / l.store.getCapacity(RESOURCE_ENERGY),
            '#cc66ff', 'LINK' + (i + 1) + ' ' + l.store[RESOURCE_ENERGY] +
            (l.cooldown > 0 ? ' cd=' + l.cooldown : ''));
        y += 0.9;
    }

    // --- Source mining status ---
    const sources = room.find(FIND_SOURCES);
    for (const src of sources) {
        const pct = src.energy / src.energyCapacity;
        const regen = src.ticksToRegeneration !== undefined ? src.ticksToRegeneration : '-';
        // Green dot on the source when it has a nearby miner.
        const minerNear = src.pos.findInRange(FIND_MY_CREEPS, 2, {
            filter: function (c) { return c.memory && c.memory.role === 'miner'; },
        }).length > 0;
        vis.circle(src.pos.x, src.pos.y, {
            radius: 0.55,
            fill: minerNear ? 'transparent' : '#ff0000',
            stroke: minerNear ? '#00ff00' : '#ff0000',
            strokeWidth: 0.12, opacity: 0.9,
        });
        vis.text(Math.floor(pct * 100) + '% t-' + regen, src.pos.x, src.pos.y - 0.8, {
            color: '#ffffaa', font: 0.45, align: 'center', opacity: 0.9,
        });
    }
    void lines;
}

function run() {
    if (!shouldDraw()) return;
    for (const rn in Game.rooms) {
        const room = Game.rooms[rn];
        if (!room.controller || !room.controller.my) continue;
        try { drawRoom(room); } catch (e) { /* visuals must never break the loop */ }
    }
}

module.exports = { run: run };
