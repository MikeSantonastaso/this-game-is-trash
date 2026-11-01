// Zone unlock requirements. Pure functions over GameState so the gate signs,
// the shop and the tests all agree on what "unlockable" means.
//
//   { type: 'money', amount }            - a fee, paid on unlock
//   { type: 'tool', id }                 - own a tool tier
//   { type: 'property', id }             - own a vehicle / building
//   { type: 'stat', stat, amount, label } - lifetime stat, e.g. bags sold
import { TOOLS } from '../data/tools.js';
import { PROPERTIES } from '../data/properties.js';

const money = (n) => `$${Math.round(n).toLocaleString()}`;

export function checkRequirement(state, req) {
  switch (req.type) {
    case 'money':
      return { ...req, label: `${money(req.amount)} fee`, met: state.money >= req.amount, progress: `${money(state.money)} / ${money(req.amount)}` };
    case 'tool': {
      const tool = TOOLS[req.id];
      return { ...req, label: `Own the ${tool?.name ?? req.id}`, met: state.ownsTool(req.id), progress: tool ? money(tool.cost) : '' };
    }
    case 'property': {
      const prop = PROPERTIES.find((p) => p.id === req.id);
      return { ...req, label: `Own the ${prop?.name ?? req.id}`, met: state.ownsProperty(req.id), progress: prop ? money(prop.cost) : '' };
    }
    case 'stat': {
      const have = state.stats[req.stat] ?? 0;
      return { ...req, label: `${req.amount} ${req.label ?? req.stat}`, met: have >= req.amount, progress: `${Math.min(have, req.amount)} / ${req.amount}` };
    }
    default:
      return { ...req, label: req.type, met: false, progress: '' };
  }
}

export function checkRequirements(state, zone) {
  return (zone.requirements ?? []).map((r) => checkRequirement(state, r));
}

export const unlockFee = (zone) => (zone.requirements ?? []).filter((r) => r.type === 'money').reduce((s, r) => s + r.amount, 0);

// { ok, reason: 'unlocked' | 'soon' | 'missing', missing: [checked requirement] }
export function canUnlock(state, zone) {
  if (state.isUnlocked(zone.id)) return { ok: false, reason: 'unlocked', missing: [] };
  if (zone.comingSoon) return { ok: false, reason: 'soon', missing: [] };
  const missing = checkRequirements(state, zone).filter((r) => !r.met);
  return { ok: missing.length === 0, reason: missing.length ? 'missing' : null, missing };
}
