const fs = require('fs');
const src = fs.readFileSync('src/economy/creepsBodies.js', 'utf8');
const COST = { move: 50, work: 100, attack: 80, carry: 50, heal: 250, ranged_attack: 150, tough: 10, claim: 600 };
const lines = src.split('\n');
let currentTable = null;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tableMatch = line.match(/const (\w+_BODIES) = \{/);
    if (tableMatch) { currentTable = tableMatch[1]; continue; }
    const entryMatch = line.match(/^\s+(\d+):\s*\[(.+)\],/);
    if (entryMatch && currentTable) {
        const key = parseInt(entryMatch[1]);
        const parts = entryMatch[2].split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
        let cost = 0;
        for (const p of parts) cost += COST[p] || 0;
        if (cost !== key) {
            console.log(currentTable + ': key=' + key + ' actual=' + cost + '  [' + entryMatch[2].trim() + ']');
        }
    }
    if (line.match(/^\};/)) currentTable = null;
}
