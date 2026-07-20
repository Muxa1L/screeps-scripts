const TaskType = require('taskBaseClass');
const taskBase = require('taskBase');
const move = require('moveUtil');

module.exports = new TaskType({
    type: 'sweep',
    priority: taskBase.PRIORITY.SWEEP,
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
    run: function (creep, task) {
        const t = task.target;
        if (!t) return false;
        if (!t.pos) return false;
        if (creep.store.getCapacity() === 0) return false;

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
        if (creep.store[RESOURCE_ENERGY] >= creep.store.getCapacity()) return false;

        if (creep.pos.isNearTo(t)) {
            let res;
            if (t.store) {
                res = creep.withdraw(t, pick);
                move.action(creep, 'withdraw@' + t.id);
            } else {
                res = creep.pickup(t);
                move.action(creep, 'pickup@' + t.id);
            }
            return res !== ERR_NOT_IN_RANGE;
        }
        move.action(creep, 'moving->sweep@' + t.id);
        move.moveCreep(creep, t, { visualizePathStyle: { stroke: '#ffff00' } });
        return true;
    },
});
