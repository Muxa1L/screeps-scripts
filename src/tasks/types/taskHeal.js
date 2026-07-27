const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');

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

        // Squad-leader priority: if this healer is paired with a fighter and
        // the leader is damaged, prefer healing it over the task target. This
        // keeps the healer in formation with its fighter. If the leader is
        // dead/gone, clear the stale link and fall through to the task target.
        const leaderId = creep.memory && creep.memory.squadLeader;
        if (leaderId) {
            const leader = Game.getObjectById(leaderId);
            if (leader && leader.hits !== undefined && leader.hits < leader.hitsMax) {
                const selfMissing = creep.hitsMax - creep.hits;
                const leaderMissing = leader.hitsMax - leader.hits;
                if (selfMissing > 0 && (selfMissing > leaderMissing || creep.hits < creep.hitsMax * 0.5)) {
                    move.action(creep, 'self-heal');
                    creep.heal(creep);
                    return true;
                }
                move.action(creep, 'healing@leader:' + leader.id);
                const res = creep.heal(leader);
                if (res === ERR_NOT_IN_RANGE) {
                    if (creep.pos.inRangeTo(leader, 3)) {
                        creep.rangedHeal(leader);
                    } else {
                        move.moveCreep(creep, leader, { visualizePathStyle: { stroke: '#00ff00' } });
                    }
                }
                return true;
            }
            if (!leader) {
                delete creep.memory.squadLeader;
            }
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
