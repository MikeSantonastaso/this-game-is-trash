// Derives the player's effective numbers from progression state.
// Everything that asks "how far can I reach / how big is my bag" goes through here.
import { TOOLS } from '../data/tools.js';
import { UPGRADES } from '../data/upgrades.js';

export function computeStats(state) {
  const tool = TOOLS[state.equippedTool] ?? TOOLS.picker_basic;
  const up = (id) => UPGRADES[id].value(state.upgradeLevel(id));
  return {
    tool,
    reach: tool.reach,
    cooldown: tool.cooldown,
    pickCount: tool.pickCount,
    autoRadius: tool.autoRadius,
    bagSize: up('bagSize'),
    bagSlots: up('bagSlots'),
    moveSpeed: up('moveSpeed'),
    valueMult: up('haggle'),
  };
}
