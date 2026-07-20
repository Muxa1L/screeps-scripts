const fs = require('fs');
const path = require('path');

const dtsPath = path.join(__dirname, '..', 'node_modules', '@types', 'screeps', 'index.d.ts');
const outPath = path.join(__dirname, '..', 'screeps-globals.json');

const text = fs.readFileSync(dtsPath, 'utf8');
const re = /^declare const ([A-Za-z_][A-Za-z0-9_]*)/gm;
const globals = {};
let m;
while ((m = re.exec(text)) !== null) {
    globals[m[1]] = 'readonly';
}

const runtimeGlobals = {
    Game: 'readonly',
    Memory: 'readonly',
    RawMemory: 'readonly',
    PathFinder: 'readonly',
    require: 'readonly',
    module: 'readonly',
    exports: 'readonly',
    _: 'readonly',
};

const merged = { ...runtimeGlobals, ...globals };
fs.writeFileSync(outPath, JSON.stringify(merged, null, 2) + '\n');
console.log('Wrote', Object.keys(merged).length, 'globals to', outPath);
