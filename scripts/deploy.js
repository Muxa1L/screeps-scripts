'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const ScreepsAPI = require('screeps-api');

const DIST = path.resolve(__dirname, '..', 'dist');

function moduleNameFromPath(base, filePath) {
    const relative = path.relative(base, filePath);
    return relative.replace(/\\/g, '/').replace(/\.js$/, '');
}

function collectModules(dir) {
    const modules = {};
    const entries = fs.readdirSync(dir);
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
            Object.assign(modules, collectModules(full));
        } else if (entry.endsWith('.js')) {
            modules[moduleNameFromPath(DIST, full)] = fs.readFileSync(full, 'utf8');
        }
    }
    return modules;
}

async function deploy() {
    const token = process.env.SCREEPS_TOKEN;
    const email = process.env.SCREEPS_EMAIL;
    const password = process.env.SCREEPS_PASSWORD;
    const branch = process.env.SCREEPS_BRANCH || 'main';

    if (!token && !(email && password)) {
        console.error('Set SCREEPS_TOKEN or both SCREEPS_EMAIL and SCREEPS_PASSWORD in .env');
        process.exit(1);
    }

    const config = {
        protocol: process.env.SCREEPS_PROTOCOL || 'https',
        hostname: process.env.SCREEPS_HOST || 'screeps.com',
        port: Number(process.env.SCREEPS_PORT || 443),
        path: process.env.SCREEPS_PATH || '/',
    };
    if (token) config.token = token;

    const api = new ScreepsAPI(config);
    if (!token) {
        await api.auth(email, password);
    }

    const modules = collectModules(DIST);
    if (!modules.main) {
        console.error('No dist/main.js found; run `npm run build` first.');
        process.exit(1);
    }

    const payload = { branch: branch, modules: modules };
    if (typeof api.userCodeSet === 'function') {
        await api.userCodeSet(payload);
    } else if (api.code && typeof api.code.set === 'function') {
        await api.code.set(branch, modules);
    } else {
        console.error('screeps-api instance does not expose a recognized upload method');
        process.exit(1);
    }
    console.log('Deployed ' + Object.keys(modules).length + ' modules to branch "' + branch + '".');
}

if (require.main === module) {
    deploy().catch(function (err) {
        console.error(err);
        process.exit(1);
    });
}

module.exports = deploy;
