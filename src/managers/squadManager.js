const memory = require('../utils/memorySchema');
const move = require('../utils/moveUtil');
const spawnUtil = require('../utils/spawnUtil');
const constants = require('../config/constants');

const SQUAD_RETREAT_HP_RATIO = constants.SQUAD_RETREAT_HP_RATIO;
const SQUAD_FORMATION_RANGE = constants.SQUAD_FORMATION_RANGE;
const SQUAD_TARGET_LATCH_TICKS = constants.SQUAD_TARGET_LATCH_TICKS;
const SQUAD_PAIRING_LOCK_TICKS = constants.SQUAD_PAIRING_LOCK_TICKS;

function isRetreating(creep) {
    return creep.hits < creep.hitsMax * SQUAD_RETREAT_HP_RATIO;
}

function findHostile(creep, forcedId) {
    if (forcedId) {
        const live = Game.getObjectById(forcedId);
        if (live && live.hits > 0) return live;
    }
    const nearest = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    return (nearest && nearest.hits > 0) ? nearest : null;
}

function moveTo(creep, target, color) {
    if (!target) return;
    move.moveCreep(creep, target, { visualizePathStyle: { stroke: color } });
}

function runSquad(squadId, leader, medic) {
    let status = 'active';
    const leaderRetreating = leader && isRetreating(leader);
    const medicRetreating = medic && isRetreating(medic);

    // Mutual retreat: if either is hurt, both run to the nearest spawn.
    if (leaderRetreating || medicRetreating) {
        status = 'retreating';
        const retreatTarget = spawnUtil.nearestSpawn(leader || medic);
        if (leader) moveTo(leader, retreatTarget, '#ff0000');
        if (medic) moveTo(medic, retreatTarget, '#ff0000');
        return status;
    }

    // Formation: keep the pair within SQUAD_FORMATION_RANGE tiles.
    if (leader && medic && !medic.pos.inRangeTo(leader, SQUAD_FORMATION_RANGE)) {
        moveTo(medic, leader, '#00ff00');
    }

    // Target sharing: leader picks a target and latches it for both creeps.
    let target = null;
    let targetId = null;
    if (leader) {
        const latchedId = memory.getSquadTarget(leader);
        const latchedTick = memory.getSquadTargetTick(leader);
        const latchValid = latchedId && Game.time - latchedTick < SQUAD_TARGET_LATCH_TICKS;
        target = findHostile(leader, latchValid ? latchedId : null);
        if (target) {
            targetId = target.id;
            memory.setSquadTarget(leader, targetId);
            if (medic) memory.setSquadTarget(medic, targetId);
        } else {
            memory.clearSquadTarget(leader);
            if (medic) memory.clearSquadTarget(medic);
        }
    }

    // Move fighter toward the target (taskDefend.run will handle actual attacks).
    if (leader && target && !leader.pos.inRangeTo(target, 1)) {
        moveTo(leader, target, '#ff0000');
    }

    return status;
}

function isPairingLocked(fighterId) {
    const lock = Memory._squadPairingLocks && Memory._squadPairingLocks[fighterId];
    return !!lock && Game.time - lock < SQUAD_PAIRING_LOCK_TICKS;
}

function lockPairing(fighterId) {
    if (!Memory._squadPairingLocks) Memory._squadPairingLocks = {};
    Memory._squadPairingLocks[fighterId] = Game.time;
}

function prunePairingLocks() {
    if (!Memory._squadPairingLocks) return;
    let changed = false;
    for (const fid in Memory._squadPairingLocks) {
        if (Game.time - Memory._squadPairingLocks[fid] >= SQUAD_PAIRING_LOCK_TICKS) {
            delete Memory._squadPairingLocks[fid];
            changed = true;
        }
    }
    // Drop the table entirely once empty so Memory stays tidy.
    if (changed && Object.keys(Memory._squadPairingLocks).length === 0) {
        delete Memory._squadPairingLocks;
    }
}

function tick() {
    if (!Memory.flags || !Memory.flags.squads) return;
    prunePairingLocks();
    const squads = memory.ensureSquads();
    const liveById = {};
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.id) continue;
        liveById[c.id] = c;
    }

    // Build live squads from memory entries and from paired creeps.
    const squadsToRun = {};
    for (const sid in squads) {
        const s = squads[sid];
        const leader = liveById[s.leaderId];
        const medic = liveById[s.medicId];
        if (leader || medic) squadsToRun[sid] = { leader: leader, medic: medic };
    }

    // Back-fill squadId/squadRole for legacy paired healers lacking them.
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        const role = memory.getRole(c);
        if (role === 'fighter') {
            const sid = memory.getSquadId(c);
            if (!sid) continue;
            if (!squadsToRun[sid]) squadsToRun[sid] = { leader: null, medic: null };
            squadsToRun[sid].leader = c;
        } else if (role === 'healer') {
            const sid = memory.getSquadId(c);
            const leaderId = c.memory && c.memory.squadLeader;
            if (!sid && leaderId) {
                const derived = 'squad-' + c.name;
                memory.setSquadId(c, derived);
                memory.setSquadRole(c, 'medic');
                const leader = Game.getObjectById(leaderId);
                if (leader) {
                    memory.setSquadId(leader, derived);
                    memory.setSquadRole(leader, 'leader');
                }
                if (!squadsToRun[derived]) squadsToRun[derived] = { leader: leader, medic: c };
                else squadsToRun[derived].medic = c;
                continue;
            }
            if (sid) {
                if (!squadsToRun[sid]) squadsToRun[sid] = { leader: null, medic: null };
                squadsToRun[sid].medic = c;
            }
        }
    }

    // Run each squad and update memory entries.
    for (const sid in squadsToRun) {
        const entry = squadsToRun[sid];
        const status = runSquad(sid, entry.leader, entry.medic);
        if (!squads[sid]) {
            squads[sid] = {
                leaderId: entry.leader ? entry.leader.id : null,
                medicId: entry.medic ? entry.medic.id : null,
                formedTick: Game.time,
            };
        }
        squads[sid].leaderId = entry.leader ? entry.leader.id : squads[sid].leaderId;
        squads[sid].medicId = entry.medic ? entry.medic.id : squads[sid].medicId;
        squads[sid].status = status;

        // Re-pair medic if its fighter died. The new leader's target/formation
        // pass for this tick was already skipped (runSquad ran with the old,
        // null leader); the medic will pick up the new leader next tick.
        if (!entry.leader && entry.medic) {
            const spawnManager = require('./spawnManager');
            const candidate = spawnManager.findUnpairedFighter();
            // Skip a fighter another squad claimed this tick / within the
            // lock window. Without this guard two squads' re-pair paths race
            // on findUnpairedFighter and the last writer wins, leaving the
            // other squad's medic paired with a fighter that has already
            // been re-pointed at the first squad.
            const newLeader = (candidate && !isPairingLocked(candidate.id)) ? candidate : null;
            if (newLeader) {
                memory.setSquadId(newLeader, sid);
                memory.setSquadRole(newLeader, 'leader');
                lockPairing(newLeader.id);
                entry.leader = newLeader;
                squads[sid].leaderId = newLeader.id;
                squads[sid].status = 'active';
            } else {
                squads[sid].status = 'broken';
            }
        }

        // Fighter continues solo if medic died.
        if (entry.leader && !entry.medic) {
            memory.clearSquadId(entry.leader);
            memory.clearSquadRole(entry.leader);
            squads[sid].status = 'broken';
        }
    }

    // Clean up broken squads whose creeps are both gone.
    for (const sid in squads) {
        const s = squads[sid];
        const leaderAlive = s.leaderId && liveById[s.leaderId];
        const medicAlive = s.medicId && liveById[s.medicId];
        if (!leaderAlive && !medicAlive) delete squads[sid];
    }
}

module.exports = {
    tick: tick,
    runSquad: runSquad,
    isRetreating: isRetreating,
};
