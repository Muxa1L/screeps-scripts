const taskBase = require('../taskBase');
const depositService = require('../../services/depositService');
const move = require('../../utils/moveUtil');
const linkService = require('../../managers/upkeep/linkService');

// Distributor: a local hauler that withdraws energy from storage and
// delivers it to spawn/extensions/towers. Unlike taskSupply (which can
// harvest from any source), the distributor only withdraws from storage,
// keeping the haul→storage→distribute pipeline clean.
module.exports = {
    type: 'distribute',
    priority: taskBase.PRIORITY.SUPPLY,
    requirements: { carry: 1 },
    cap: 3,
    canDo: function (creep) {
        return creep.getActiveBodyparts(CARRY) > 0;
    },
    tasks: function (room, snap) {
        // Need either storage or a non-source link with energy to distribute.
        const storageEnergy = snap.storage ? (snap.storage.store[RESOURCE_ENERGY] || 0) : 0;
        const sources = snap.sources || [];
        let storageLinkEnergy = 0;
        let storageLink = null;
        if (snap.links) {
            for (let i = 0; i < snap.links.length; i++) {
                if (!linkService.isSourceLink(snap.links[i], sources)) {
                    storageLinkEnergy += snap.links[i].store[RESOURCE_ENERGY] || 0;
                    storageLink = snap.links[i];
                }
            }
        }
        if (storageEnergy < 50 && storageLinkEnergy < 50) return [];
        const out = [];
        // If storage link has energy and storage has room, add a task to
        // move energy from storage link → storage (keeps the link network
        // flowing and centralizes energy in storage for distributors).
        // When the storage link is nearly full (≥90%), this task is
        // critical — a full link blocks source-link transfers, jamming
        // the entire pipeline. Tag it so the score function can prioritize.
        if (snap.storage && snap.links && storageLinkEnergy >= 50) {
            const storageFree = snap.storage.store.getFreeCapacity(RESOURCE_ENERGY) || 0;
            if (storageFree > 50) {
                const linkCap = storageLink ? (storageLink.store.getCapacity(RESOURCE_ENERGY) || 800) : 800;
                const linkUrgent = storageLinkEnergy >= linkCap * 0.9;
                // Attach fromLink/urgent to the target object so they survive
                // makeTask (which only copies target, not task-level props).
                out.push({ target: { id: snap.storage.id, pos: snap.storage.pos, fromLink: true, urgent: linkUrgent } });
            }
        }
        // Normal distribute tasks: fill spawn/extensions/towers from storage
        // or storage link. The withdraw phase (run) already tries the storage
        // link first, so the gate only needs either source to have energy.
        if ((storageEnergy >= 50 || storageLinkEnergy >= 50) && snap.energyStructures) {
            for (let i = 0; i < snap.energyStructures.length; i++) {
                const s = snap.energyStructures[i];
                const capacity = s.store.getCapacity(RESOURCE_ENERGY) || 0;
                const energy = s.store[RESOURCE_ENERGY] || 0;
                if (energy >= capacity) continue;
                out.push({ target: s });
            }
        }
        return out;
    },
    score: function (creep, target) {
        const dist = taskBase.approxDistance(creep, target);
        // Urgent fromLink tasks (storage link ≥90% full) get a large score
        // bonus so a distributor picks them over normal distribute targets.
        // Without this, both task types share priority SUPPLY and the
        // nearest target wins — the link stays full and the pipeline jams.
        if (target && target.urgent) return dist - 500;
        return dist;
    },
    run: function (creep, task, snap) {
        const target = task.target;
        if (!target || !target.id) return false;
        const live = Game.getObjectById(target.id);
        if (!live || live.store === undefined) return false;

        const creepEnergy = creep.store[RESOURCE_ENERGY] || 0;

        // Link-to-storage task: withdraw from storage link, deposit into storage.
        if (target && target.fromLink) {
            const storageFree = live.store.getFreeCapacity(RESOURCE_ENERGY) || 0;
            if (storageFree <= 0) return false; // storage full
            if (creepEnergy === 0) {
                // Find the storage link (non-source link with energy).
                if (!snap || !snap.links) return false;
                const sources = snap.sources || [];
                let linkTarget = null;
                for (let i = 0; i < snap.links.length; i++) {
                    const l = snap.links[i];
                    if (linkService.isSourceLink(l, sources)) continue;
                    if ((l.store[RESOURCE_ENERGY] || 0) >= 50) { linkTarget = l; break; }
                }
                if (!linkTarget) return false;
                move.action(creep, 'withdraw@link->storage');
                const wRes = creep.withdraw(linkTarget, RESOURCE_ENERGY);
                if (wRes === ERR_NOT_IN_RANGE) {
                    move.moveCreep(creep, linkTarget, { visualizePathStyle: { stroke: '#aaffaa' } });
                    return true;
                }
                return wRes === OK || wRes === ERR_FULL || wRes === ERR_NOT_ENOUGH_RESOURCES;
            }
            // Deposit into storage. Keep the task active (return true) after
            // a successful deposit so the distributor immediately goes back to
            // the link for another load. Returning false would blacklist the
            // task for 5 ticks (blacklistTtlFor default), throttling the
            // link→storage flow to once per 5 ticks — far too slow when the
            // link is nearly full and the pipeline is jamming.
            const stillCarrying = depositService.transferTo(creep, live, RESOURCE_ENERGY);
            if (!stillCarrying) return true; // emptied into storage; go refill
            return true;
        }

        // Normal distribute: fill spawn/extension/tower from storage or link.
        const capacity = live.store.getCapacity(RESOURCE_ENERGY) || 0;
        const energy = live.store[RESOURCE_ENERGY] || 0;
        if (energy >= capacity) return false;

        // Refuel phase: withdraw from storage or storage link.
        if (creepEnergy === 0) {
            if (!snap) return false;
            // Find a withdraw source: storage link first (it fills up from
            // source links and has no other consumer), then storage.
            const sources = snap.sources || [];
            let withdrawTarget = null;
            if (snap.links) {
                for (let i = 0; i < snap.links.length; i++) {
                    const l = snap.links[i];
                    if (linkService.isSourceLink(l, sources)) continue;
                    if ((l.store[RESOURCE_ENERGY] || 0) >= 50) {
                        withdrawTarget = l;
                        break;
                    }
                }
            }
            if (!withdrawTarget && snap.storage) {
                const storageEnergy = snap.storage.store[RESOURCE_ENERGY] || 0;
                if (storageEnergy >= 50) {
                    withdrawTarget = Game.getObjectById(snap.storage.id);
                }
            }
            if (!withdrawTarget) return false;
            move.action(creep, 'withdraw@' + withdrawTarget.id);
            const wRes = creep.withdraw(withdrawTarget, RESOURCE_ENERGY);
            if (wRes === ERR_NOT_IN_RANGE) {
                move.moveCreep(creep, withdrawTarget, { visualizePathStyle: { stroke: '#aaffaa' } });
                return true;
            }
            // OK, ERR_FULL, or ERR_NOT_ENOUGH_RESOURCES (transient race) —
            // keep the task so the creep retries next tick.
            return wRes === OK || wRes === ERR_FULL || wRes === ERR_NOT_ENOUGH_RESOURCES;
        }

        // Delivery phase: transfer to the target structure.
        const hadEnergy = creepEnergy;
        const stillCarrying = depositService.transferTo(creep, live, RESOURCE_ENERGY);
        if (hadEnergy > 0 && !stillCarrying) return false;
        return true;
    },
};