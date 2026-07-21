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
        for (let i = 0; i < snap.droppedEnergy.length; i++) {
            out.push({ target: snap.droppedEnergy[i] });
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
        return taskBase.pathScore(creep, target);
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
                    // No deposit available; keep the sweep task to avoid
                    // rapidly cycling between pickup targets.
                    return true;
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

        if (creep.pos.isNearTo(t)) {
            let res;
            if (t.store) {
                res = creep.withdraw(t, pick);
                move.action(creep, 'withdraw@' + t.id);
            } else {
                res = creep.pickup(t);
                move.action(creep, 'pickup@' + t.id);
            }
            return res === OK;
        }
        move.action(creep, 'moving->sweep@' + t.id);
        move.moveCreep(creep, t, { visualizePathStyle: { stroke: '#ffff00' } });
        return true;
    },
};
