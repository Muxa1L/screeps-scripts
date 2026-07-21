'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { ScreepsHttpClient } = require('screeps-api');

const DIST = path.resolve(__dirname, '..', 'dist');

function collectModules() {
    const mainPath = path.join(DIST, 'main.js');
    if (!fs.existsSync(mainPath)) {
        return null;
    }
    return { main: fs.readFileSync(mainPath, 'utf8') };
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

    const api = new ScreepsHttpClient({
        hostname: config.hostname,
        port: config.port,
        protocol: config.protocol,
        path: config.path,
        token: token,
        email: email,
        password: password,
    });

    const modules = collectModules();
    if (!modules) {
        console.error('No dist/main.js found; run `npm run build` first.');
        process.exit(1);
    }

    const payload = { branch: branch, modules: modules };
    await api.userCodeSet(payload);
    console.log('Deployed ' + Object.keys(modules).length + ' modules to branch "' + branch + '".');
}

if (require.main === module) {
    deploy().catch(function (err) {
        console.error(err);
        process.exit(1);
    });
}

module.exports = deploy;
