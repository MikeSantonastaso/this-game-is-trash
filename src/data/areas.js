// Areas in progression order. Only the park is built for this prototype; the
// rest are here so the shop, save data and unlock flow already know about them.
//
// builder        - key into world/builders (which layout function to run)
// trashMax       - how much trash is on the ground at once
// respawnSeconds - one new piece every N seconds until trashMax
// trashWeights   - spawn table for TRASH_TYPES
// valueMultiplier- richer areas pay more per item
export const AREAS = [
  {
    id: 'park', name: 'Dumpy Park', unlockCost: 0, builder: 'park', size: 64,
    description: 'A neglected little park. Wrappers, cans and one suspicious tire.',
    trashMax: 55, respawnSeconds: 2.5, valueMultiplier: 1,
    trashWeights: { wrapper: 6, can: 5, cup: 4, bottle: 4, pizzaBox: 1.2, tire: 0.25 },
  },
  {
    id: 'small_hood', name: 'Small Neighborhood', unlockCost: 5000, builder: null, comingSoon: true,
    description: 'Cul-de-sacs, curbside bins and lawns. Unlocks the pickup truck.',
    trashMax: 90, respawnSeconds: 1.5, valueMultiplier: 1.5,
    trashWeights: { wrapper: 4, can: 5, cup: 3, bottle: 5, pizzaBox: 3, tire: 0.6 },
  },
  {
    id: 'big_hood', name: 'Big Neighborhood', unlockCost: 40000, builder: null, comingSoon: true,
    description: 'Whole blocks of curbside cans. Garbage truck with the lifting arm.',
    trashMax: 140, respawnSeconds: 1, valueMultiplier: 2.5,
    trashWeights: { wrapper: 3, can: 5, cup: 3, bottle: 5, pizzaBox: 4, tire: 1 },
  },
  {
    id: 'city', name: 'The City', unlockCost: 250000, builder: null, comingSoon: true,
    description: 'Alleys, dumpsters, chaos. Run a fleet and your own dump.',
    trashMax: 220, respawnSeconds: 0.6, valueMultiplier: 4,
    trashWeights: { wrapper: 3, can: 6, cup: 4, bottle: 5, pizzaBox: 5, tire: 1.5 },
  },
];

export const getArea = (id) => AREAS.find((a) => a.id === id) ?? AREAS[0];
