// Trash item definitions. Pure data: no Three.js or physics imports, so this
// file ports directly to a Godot Resource / Unity ScriptableObject later.
//
// value  - base sale price in dollars
// space  - how much room it takes in a bag (bag size is upgradeable)
// mass   - physics mass in kg (affects how far it flies when kicked/thrown)
// mesh   - collision shape (and look, for procedural trash)
// models - optional model ids from data/models.js to use instead of procedural meshes
export const TRASH_TYPES = {
  wrapper: {
    id: 'wrapper', name: 'Candy Wrapper', value: 1, space: 1, mass: 0.1,
    mesh: { shape: 'box', size: [0.28, 0.04, 0.18], color: 0xf2c94c, accent: 0xeb5757 },
  },
  can: {
    id: 'can', name: 'Soda Can', value: 2, space: 1, mass: 0.2,
    mesh: { shape: 'cylinder', radiusTop: 0.08, radiusBottom: 0.08, height: 0.22, color: 0xd64545, accent: 0xdddddd },
  },
  cup: {
    id: 'cup', name: 'Coffee Cup', value: 2, space: 1, mass: 0.15,
    mesh: { shape: 'cylinder', radiusTop: 0.1, radiusBottom: 0.07, height: 0.22, color: 0xf5f0e6, accent: 0x7b4a2a },
  },
  bottle: {
    id: 'bottle', name: 'Plastic Bottle', value: 3, space: 1, mass: 0.25,
    mesh: { shape: 'cylinder', radiusTop: 0.05, radiusBottom: 0.09, height: 0.38, color: 0x56c2a6, accent: 0x2d6cdf },
  },
  pizzaBox: {
    id: 'pizzaBox', name: 'Greasy Pizza Box', value: 6, space: 2, mass: 0.6,
    mesh: { shape: 'box', size: [0.6, 0.08, 0.6], color: 0xc8a165, accent: 0xb33a3a },
  },
  beer: {
    id: 'beer', name: 'Empty Beer Can', value: 2, space: 1, mass: 0.2, models: ['beerCanOpen', 'beerCanCrushed', 'beerCan'],
    mesh: { shape: 'cylinder', radiusTop: 0.07, radiusBottom: 0.07, height: 0.2, color: 0xb22222, accent: 0xdddddd },
  },
  gasCan: {
    id: 'gasCan', name: 'Leaky Gas Can', value: 14, space: 3, mass: 3, models: ['gasCan'],
    mesh: { shape: 'box', size: [0.36, 0.42, 0.14], color: 0x8b1a1a, accent: 0x222222 },
  },
  tire: {
    id: 'tire', name: 'Old Tire', value: 25, space: 4, mass: 8,
    mesh: { shape: 'torus', radius: 0.38, tube: 0.14, color: 0x222222, accent: 0x444444 },
  },
};

// Weighted random pick from an area's { typeId: weight } table.
export function pickWeighted(weights, rng = Math.random) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [id, w] of entries) { roll -= w; if (roll <= 0) return id; }
  return entries[entries.length - 1][0];
}
