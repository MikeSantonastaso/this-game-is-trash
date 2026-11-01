// Levelled upgrades bought at the shop. value(level) gives the stat,
// cost(level) gives the price of buying the NEXT level.
export const UPGRADES = {
  bagSize: {
    id: 'bagSize', name: 'Bigger Bags', unit: 'space per bag', maxLevel: 10,
    description: 'Contractor-grade bags. Hold more before you have to tie them off.',
    value: (lvl) => 6 + lvl * 2,
    cost: (lvl) => Math.round(25 * 1.6 ** lvl),
  },
  bagSlots: {
    id: 'bagSlots', name: 'Belt Hooks', unit: 'tied bags carried', maxLevel: 5,
    description: 'Hang more full bags off your belt. Fashionable.',
    value: (lvl) => 1 + lvl,
    cost: (lvl) => Math.round(60 * 2.2 ** lvl),
  },
  moveSpeed: {
    id: 'moveSpeed', name: 'Orthopedic Sneakers', unit: 'm/s', maxLevel: 8,
    description: 'Walk faster. Your knees thank you.',
    value: (lvl) => 5 + lvl * 0.6,
    cost: (lvl) => Math.round(40 * 1.75 ** lvl),
  },
  haggle: {
    id: 'haggle', name: 'Haggling Skills', unit: 'x sale value', maxLevel: 10,
    description: 'Convince the dump that this is premium trash.',
    value: (lvl) => +(1 + lvl * 0.15).toFixed(2),
    cost: (lvl) => Math.round(80 * 1.9 ** lvl),
  },
};

export const UPGRADE_ORDER = ['bagSize', 'bagSlots', 'moveSpeed', 'haggle'];
