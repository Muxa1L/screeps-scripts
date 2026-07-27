const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');
const memory = require('../../utils/memorySchema');
const constants = require('../../config/constants');

const SQUAD_RETREAT_HP_RATIO = constants.SQUAD_RETREAT_HP_RATIO;

module.exports = {
    type: 'heal',
    priority: taskBase.PRIORITY.HEAL,
    requirements: { heal: 1 },
    cap: 4,
    canDo: function (creep) {
        return creep.getActiveBodyparts(HEAL) > 0;
    },
    tasks: function (room, snap) {
        return snap.damagedFriendlies.map(function (c) { return { target: c }; });
    },
    run: function (creep, task, _snap) {
        if (creep.getActiveBodyparts(HEAL) === 0) return false;

        // Honor mutual squad retreat: if this healer or its leader is badly
        // hurt, move with the leader toward the nearest spawn instead of
        // chasing a target.
        const leaderId = creep.memory && creep.memory.squadLeader;
        const leader = leaderId ? Game.getObjectById(leaderId) : null;
        if (leader && (creep.hits < creep.hitsMax * SQUAD_RETREAT_HP_RATIO || leader.hits < leader.hitsMax * SQUAD_RETREAT_HP_RATIO)) {
            move.action(creep, 'retreat-with-leader@' + leader.id);
            if (!creep.pos.inRangeTo(leader, 1)) {
                move.moveCreep(creep, leader, { visualizePathStyle: { stroke: '#ff0000' } });
            }
            return true;
        }

        // Squad-leader priority: if this healer is paired with a fighter and
        // the leader is damaged, prefer healing it over the task target. This
        // keeps the healer in formation with its fighter. If the leader is
        // dead/gone, clear the stale link and fall through to the task target.
        if (leaderId) {
            const squadLeader = Game.getObjectById(leaderId);
            if (squadLeader && squadLeader.hits !== undefined && squadLeader.hits < squadLeader.hitsMax) {
                const selfMissing = creep.hitsMax - creep.hits;
                const leaderMissing = squadLeader.hitsMax - squadLeader.hits;
                if (selfMissing > 0 && (selfMissing > leaderMissing || creep.hits < creep.hitsMax * 0.5)) {
                    move.action(creep, 'self-heal');
                    creep.heal(creep);
                    return true;
                }
                move.action(creep, 'healing@leader:' + squadLeader.id);
                const res = creep.heal(squadLeader);
                if (res === ERR_NOT_IN_RANGE) {
                    if (creep.pos.inRangeTo(squadLeader, 3)) {
                        creep.rangedHeal(squadLeader);
                    } else {
                        move.moveCreep(creep, squadLeader, { visualizePathStyle: { stroke: '#00ff00' } });
                    }
                }
                return true;
            }
            if (!squadLeader) {
                delete creep.memory.squadLeader;
            }
        }

        // Squad target sharing: if a shared squad target exists and is
        // reachable, move toward it so the medic stays near the fight.
        const sharedId = memory.getSquadTarget(creep);
        const shared = sharedId ? Game.getObjectById(sharedId) : null;
        if (shared && shared.hits > 0 && !creep.pos.inRangeTo(shared, 3)) {
            move.action(creep, 'follow-squad-target@' + shared.id);
            move.moveCreep(creep, shared, { visualizePathStyle: { stroke: '#00ff00' } });
            return true;
        }

        const target = task.target;
        if (!target || !target.id) return false;
        const live = Game.getObjectById(target.id);
        if (!live || live.hits === undefined || live.hits >= live.hitsMax) return false;
        const selfMissing = creep.hitsMax - creep.hits;
        const targetMissing = live.hitsMax - live.hits;
        if (selfMissing > 0 && (selfMissing > targetMissing || creep.hits < creep.hitsMax * 0.5)) {
            move.action(creep, 'self-heal');
            creep.heal(creep);
            return true;
        }
        move.action(creep, 'healing@' + live.id);
        const res = creep.heal(live);
        if (res === ERR_NOT_IN_RANGE) {
            if (creep.pos.inRangeTo(live, 3)) {
                creep.rangedHeal(live);
            } else {
                move.moveCreep(creep, live, { visualizePathStyle: { stroke: '#00ff00' } });
            }
        }
        return true;
    },
};
