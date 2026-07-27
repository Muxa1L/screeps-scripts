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

const MINER_BODIES = {
    200:  [WORK, CARRY, MOVE],
    300:  [WORK, WORK, CARRY, MOVE],
    550:  [WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE],
    800:  [WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE],
    1100: [WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
    1650: [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
    2200: [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
    3300: [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
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

const HARVESTER_BODIES = {
    200:  [WORK, CARRY, MOVE],
    300:  [WORK, CARRY, CARRY, MOVE, MOVE],
    400:  [WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE],
    550:  [WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE],
    800:  [WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE],
    1300: [WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
    1800: [WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
};

const UPGRADER_BODIES = {
    200:  [WORK, CARRY, MOVE],
    300:  [WORK, CARRY, CARRY, MOVE, MOVE],
    550:  [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE],
    800:  [WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE],
    1300: [WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
    1800: [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
    2300: [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
    5600: [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
};

const FIGHTER_BODIES = {
    570:  [TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK],
    940:  [TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK],
    1340: [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK],
};

const HEALER_BODIES = {
    930:  [TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL],
    1540: [TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL, HEAL, HEAL],
    2300: [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL],
};

const BUILDER_BODIES = {
    200:  [WORK, CARRY, MOVE],
    300:  [WORK, CARRY, CARRY, MOVE, MOVE],
    400:  [WORK, WORK, CARRY, CARRY, MOVE, MOVE],
    550:  [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE],
    800:  [WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE],
    1300: [WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
    1800: [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
    2300: [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE],
};

const BODIES = {
    miner:    MINER_BODIES,
    hauler:   HAULER_BODIES,
    harvester:HARVESTER_BODIES,
    upgrader: UPGRADER_BODIES,
    fighter:  FIGHTER_BODIES,
    healer:   HEALER_BODIES,
    builder:  BUILDER_BODIES,
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
        harvester: Object.keys(HARVESTER_BODIES).map(Number),
        upgrader: Object.keys(UPGRADER_BODIES).map(Number),
        fighter: Object.keys(FIGHTER_BODIES).map(Number),
        healer: Object.keys(HEALER_BODIES).map(Number),
        builder: Object.keys(BUILDER_BODIES).map(Number),
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
