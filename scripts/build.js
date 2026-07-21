'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SRC = path.join(ROOT, 'src');
const ROOT_MAIN = path.join(ROOT, 'main.js');

function rimraf(dir) {
    if (!fs.existsSync(dir)) return;
    fs.rmSync(dir, { recursive: true, force: true });
}

function copyRecursive(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src);
        for (let i = 0; i < entries.length; i++) {
            copyRecursive(path.join(src, entries[i]), path.join(dest, entries[i]));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

function build() {
    rimraf(DIST);
    fs.mkdirSync(DIST, { recursive: true });
    copyRecursive(SRC, path.join(DIST, 'src'));
    fs.copyFileSync(ROOT_MAIN, path.join(DIST, 'main.js'));
    console.log('Built dist/ (' + SRC + ' -> ' + path.join(DIST, 'src') + ')');
}

if (require.main === module) {
    build();
}

module.exports = build;
