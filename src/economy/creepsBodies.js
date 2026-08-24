const PART_COST = {
    [MOVE]:   50,
    [WORK]:   100,
    [CARRY]:  50,
    [ATTACK]: 80,
    [RANGED_ATTACK]: 150,
    [HEAL]:   200,
    [TOUGH]:  10,
    [CLAIM]:  600,
};

function bodyCost(body) {
    let total = 0;
    for (let i = 0; i < body.length; i++) {
        total += PART_COST[body[i]] || 0;
    }
    return total;
}

// `creep.body` is an array of {type, ...} objects, unlike the string-constant
// arrays in the BODIES tables, so bodyCost(creep.body) would return 0.
function bodyCostOfCreep(creep) {
    let total = 0;
    const body = creep.body;
    for (let i = 0; i < body.length; i++) {
        total += PART_COST[body[i].type] || 0;
    }
    return total;
}

// Static miners sit on a link or container next to the source and harvest
// continuously. 1 CARRY is needed to buffer energy for transfer into a link
// (harvest fills CARRY, then transfer empties it each tick). Without CARRY,
// energy drops on the ground (fine for containers, bad for links).
// 5 WORK = 10 energy/tick = matches source regen (3000/300).
// 2 MOVE is enough on roads; on plains the miner moves 1 tile/3 ticks (fine
// for a static creep that only walks to the source once).
const MINER_BODIES = {
    200:  [WORK, CARRY, MOVE],
    300:  [WORK, WORK, CARRY, MOVE],
    400:  [WORK, WORK, WORK, CARRY, MOVE],
    500:  [WORK, WORK, WORK, WORK, CARRY, MOVE],
    600:  [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE],
    650:[WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE],
    750:[WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE],
    900: [WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE],
    1300:[WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE],
};

const HAULER_BODIES = {
    100:  [CARRY, MOVE],
    200:  [CARRY, CARRY, MOVE, MOVE],
    400:  [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE],
    450:  [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE],
    950:  [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
    1200: [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
    1500: [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
    2400: [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
};

// Distributors are local haulers (storage → spawn/extensions/towers).
// They travel short distances on roads, so they use a 2:1 CARRY:MOVE
// ratio — on roads 1 MOVE handles 2 CARRY, giving max speed with minimal
// cost. No WORK parts needed. Minimum useful body is [CARRY, MOVE]: without
// MOVE the creep accumulates fatigue on its first step and can never move
// again (fatigue only dissipates via MOVE parts).
const DISTRIBUTOR_BODIES = {
    100:  [CARRY, MOVE],
    150:  [CARRY, CARRY, MOVE],
    300:  [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE],
    450:  [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE],
    600:  [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE],
    900:  [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
};

const HARVESTER_BODIES = {
    200:  [WORK, CARRY, MOVE],
    300:  [WORK, CARRY, CARRY, MOVE, MOVE],
    400:  [WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE],
    500:[WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE],
    800:  [WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE],
    1250:[WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
    1600:[WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
};

const UPGRADER_BODIES = {
    200:  [WORK, CARRY, MOVE],
    300:  [WORK, CARRY, CARRY, MOVE, MOVE],
    550:  [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE],
    700:[WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE],
    1150:[WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
    1550:[WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
    2100:[WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
    3500:[WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
};

const FIGHTER_BODIES = {
    570:  [TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK],
    940:  [TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK],
    1340: [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK],
};

const HEALER_BODIES = {
    1080:[TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL],
    1790:[TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL, HEAL, HEAL],
    2700:[TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL],
};

const BUILDER_BODIES = {
    200:  [WORK, CARRY, MOVE],
    300:  [WORK, CARRY, CARRY, MOVE, MOVE],
    400:  [WORK, WORK, CARRY, CARRY, MOVE, MOVE],
    550:  [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE],
    800:  [WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE],
    1200:[WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
    1600:[WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
    2000:[WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
};

const SCOUT_BODIES = {
    50: [MOVE],
};

const RESERVER_BODIES = {
    700:[CLAIM, MOVE, MOVE],
    1300: [CLAIM, CLAIM, MOVE, MOVE],
};

const REMOTE_MINER_BODIES = MINER_BODIES;

const REMOTE_HAULER_BODIES = {
    100:  [CARRY, MOVE],
    200:  [CARRY, CARRY, MOVE, MOVE],
    400:  [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE],
    600:[CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE],
    900: [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
    1200:[CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
};

const REMOTE_BUILDER_BODIES = {
    350:[WORK, CARRY, CARRY, MOVE, MOVE, MOVE],
    600:[WORK, WORK, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE],
};

const CLAIMER_BODIES = {
    700:[CLAIM, MOVE, MOVE],
};

const BOOTSTRAPPER_BODIES = {
    250:[WORK, CARRY, MOVE, MOVE],
    400:[WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE],
};

const BODIES = {
    miner:    MINER_BODIES,
    hauler:   HAULER_BODIES,
    distributor: DISTRIBUTOR_BODIES,
    harvester:HARVESTER_BODIES,
    upgrader: UPGRADER_BODIES,
    fighter:  FIGHTER_BODIES,
    healer:   HEALER_BODIES,
    builder:  BUILDER_BODIES,
    scout:    SCOUT_BODIES,
    reserver: RESERVER_BODIES,
    remoteMiner: REMOTE_MINER_BODIES,
    remoteHauler: REMOTE_HAULER_BODIES,
    remoteBuilder: REMOTE_BUILDER_BODIES,
    claimer:  CLAIMER_BODIES,
    bootstrapper: BOOTSTRAPPER_BODIES,
};

function bestBodyForAvailable(role, capacity, available) {
    return bestBodyForCapacity(role, Math.min(capacity, available));
}

function bestBodyForCapacity(role, capacity) {
    const table = BODIES[role];
    if (!table) return null;
    const keys = Object.keys(table).map(Number).sort(function (a, b) { return a - b; });
    let chosenKey = null;
    let chosenCost = null;
    for (let i = 0; i < keys.length; i++) {
        const body = table[keys[i]];
        const cost = bodyCost(body);
        if (cost > capacity) break;
        chosenKey = keys[i];
        chosenCost = cost;
    }
    if (chosenKey === null) return null;
    return { body: table[chosenKey], cost: chosenCost, role: role };
}

function bodySummary() {
    return {
        miner: Object.keys(MINER_BODIES).map(Number),
        hauler: Object.keys(HAULER_BODIES).map(Number),
        distributor: Object.keys(DISTRIBUTOR_BODIES).map(Number),
        harvester: Object.keys(HARVESTER_BODIES).map(Number),
        upgrader: Object.keys(UPGRADER_BODIES).map(Number),
        fighter: Object.keys(FIGHTER_BODIES).map(Number),
        healer: Object.keys(HEALER_BODIES).map(Number),
        builder: Object.keys(BUILDER_BODIES).map(Number),
        scout: Object.keys(SCOUT_BODIES).map(Number),
        reserver: Object.keys(RESERVER_BODIES).map(Number),
        remoteMiner: Object.keys(REMOTE_MINER_BODIES).map(Number),
        remoteHauler: Object.keys(REMOTE_HAULER_BODIES).map(Number),
        remoteBuilder: Object.keys(REMOTE_BUILDER_BODIES).map(Number),
        claimer: Object.keys(CLAIMER_BODIES).map(Number),
        bootstrapper: Object.keys(BOOTSTRAPPER_BODIES).map(Number),
    };
}

module.exports = {
    bestBodyForAvailable: bestBodyForAvailable,
    bestBodyForCapacity: bestBodyForCapacity,
    bodyCost: bodyCost,
    bodyCostOfCreep: bodyCostOfCreep,
    bodySummary: bodySummary,
    BODIES: BODIES,
};
