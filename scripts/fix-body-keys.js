const fs = require('fs');
const path = 'src/economy/creepsBodies.js';
const COST = { move: 50, work: 100, attack: 80, carry: 50, heal: 250, ranged_attack: 150, tough: 10, claim: 600 };
let src = fs.readFileSync(path, 'utf8');
const lines = src.split('\n');
let currentTable = null;
let fixed = 0;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tableMatch = line.match(/const (\w+_BODIES) = \{/);
    if (tableMatch) { currentTable = tableMatch[1]; continue; }
    const entryMatch = line.match(/^(\s+)(\d+):(\s*)\[(.+)\](,?)\s*$/);
    if (entryMatch && currentTable) {
        const key = parseInt(entryMatch[2]);
        const parts = entryMatch[4].split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
        let cost = 0;
        for (const p of parts) cost += COST[p] || 0;
        if (cost !== key && cost > 0) {
            // Preserve alignment padding
            const newKeyStr = String(cost);
            const padLen = Math.max(0, entryMatch[2].length - newKeyStr.length);
            const pad = ' '.repeat(padLen);
            lines[i] = entryMatch[1] + newKeyStr + ':' + pad + '[' + entryMatch[4] + ']' + entryMatch[5];
            fixed++;
        }
    }
    if (line.match(/^\};/)) currentTable = null;
}
fs.writeFileSync(path, lines.join('\n'));
console.log('Fixed ' + fixed + ' tier keys in ' + path);

// Verify
src = fs.readFileSync(path, 'utf8');
const verifyLines = src.split('\n');
currentTable = null;
let mismatches = 0;
for (let i = 0; i < verifyLines.length; i++) {
    const line = verifyLines[i];
    const tableMatch = line.match(/const (\w+_BODIES) = \{/);
    if (tableMatch) { currentTable = tableMatch[1]; continue; }
    const entryMatch = line.match(/^\s+(\d+):\s*\[(.+)\],/);
    if (entryMatch && currentTable) {
        const key = parseInt(entryMatch[1]);
        const parts = entryMatch[2].split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
        let cost = 0;
        for (const p of parts) cost += COST[p] || 0;
        if (cost !== key) {
            console.log('STILL WRONG: ' + currentTable + ': key=' + key + ' actual=' + cost);
            mismatches++;
        }
    }
    if (line.match(/^\};/)) currentTable = null;
}
console.log(mismatches === 0 ? 'All keys verified correct.' : mismatches + ' mismatches remain!');
