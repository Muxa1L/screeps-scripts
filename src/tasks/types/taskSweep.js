const taskBase = require('../taskBase');
const move = require('../../utils/moveUtil');
const depositService = require('../../services/depositService');

module.exports = {
    type: 'sweep',
    priority: taskBase.PRIORITY.SWEEP,
    requirements: { carry: 1 },
    cap: 2,
    canDo: function (creep) {
        return creep.getActiveBodyparts(CARRY) > 0;
    },
    tasks: function (room, snap) {
        const out = [];
        const constants = require('../../config/constants');
        for (let i = 0; i < snap.droppedEnergy.length; i++) {
            const drop = snap.droppedEnergy[i];
            if ((drop.amount || 0) < constants.DROPPED_ENERGY_MIN) continue;
            out.push({ target: drop });
        }
        for (let j = 0; j < snap.tombstones.length; j++) {
            const t = snap.tombstones[j];
            if (_.sum(t.store) > 0) out.push({ target: t });
        }
        for (let k = 0; k < snap.ruins.length; k++) {
            const r = snap.ruins[k];
            if (_.sum(r.store) > 0) out.push({ target: r });
        }
        return out;
    },
    score: function (creep, target) {
        const dist = taskBase.pathScore(creep, target);
        const amount = target.store ? _.sum(target.store) : (target.amount || 0);
        // Small amount bonus: a 1000-energy pile beats an equal-distance 100-energy
        // pile by ~9 tiles. Drops are already thresholded, so this mainly helps
        // prioritize big tombstones/ruins and occasional large drops.
        return dist - Math.min(amount / 100, 10);
    },
    run: function (creep, task, snap) {
        const target = task.target;
        const t = target ? Game.getObjectById(target.id) : null;
        if (!t) return false;
        if (!t.pos) return false;
        if (creep.store.getCapacity() === 0) return false;
        const remaining = t.store ? _.sum(t.store) : (t.amount || 0);
        if (remaining <= 0) return false;
        if (creep.store.getFreeCapacity() === 0) {
            const carried = Object.keys(creep.store);
            for (let i = 0; i < carried.length; i++) {
                const rtype = carried[i];
                if (creep.store[rtype] <= 0) continue;
                const deposit = depositService.findDeposit(creep, snap, { resourceType: rtype });
                if (!deposit) {
                    // No deposit for this resource type — try the next one
                    // before giving up (e.g. storage full for energy but has
                    // room for minerals).
                    continue;
                }
                if (depositService.transferTo(creep, deposit, rtype)) {
                    // Still carrying this resource type; keep sweeping/depositing.
                    return true;
                }
            }
            // No resources left to deposit; release so the creep can pick up again.
            return false;
        }

        let amount;
        let pick;
        if (t.store) {
            const keys = Object.keys(t.store);
            for (let i = 0; i < keys.length; i++) {
                if (t.store[keys[i]] > 0) { pick = keys[i]; break; }
            }
            if (!pick) return false;
            amount = t.store[pick];
        } else {
            pick = RESOURCE_ENERGY;
            amount = t.amount;
        }
        if (!amount || amount <= 0) return false;

        const isDropped = !t.store;
        const inRange = isDropped ? creep.pos.isEqualTo(t) : creep.pos.isNearTo(t);
        if (inRange) {
            let res;
            if (t.store) {
                res = creep.withdraw(t, pick);
                move.action(creep, 'withdraw@' + t.id);
            } else {
                res = creep.pickup(t);
                move.action(creep, 'pickup@' + t.id);
            }
            if (res !== OK) return false;
            // For a tombstone/ruin with more resources remaining after this
            // withdraw, keep the task so the creep returns next tick instead
            // of re-evaluating (mirrors the hauler fix from efficiency-audit
            // #4). Dropped resources are single-tile single-resource, so
            // releasing is fine.
            if (t.store) {
                const stillRemaining = _.sum(t.store);
                if (stillRemaining > 0) return true;
            }
            return false;
        }
        move.action(creep, 'moving->sweep@' + t.id);
        move.moveCreep(creep, t, { visualizePathStyle: { stroke: '#ffff00' }, exactTile: isDropped });
        return true;
    },
};
