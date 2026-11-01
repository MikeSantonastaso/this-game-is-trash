// Ownable property and vehicles. `available: false` entries are shown as
// "coming soon" so the long-term loop is visible from day one.
export const PROPERTIES = [
  { id: 'pickup', name: 'Rusty Pickup', cost: 4000, available: true,
    description: 'Drive it (F at the door). The bed holds 12 bags. Friends ride in the back (unsafely). Needed for Oakridge Heights.' },
  { id: 'garage', name: 'Your Own Garage', cost: 3000, description: 'Store vehicles and tools. Customize your crew\'s outfits.' },
  { id: 'garbage_truck', name: 'Garbage Truck w/ Lifting Arm', cost: 30000, description: 'The arm lifts curbside bins. The arm also lifts friends. Needed for Downtown.' },
  { id: 'dump', name: 'Own the Dump', cost: 150000, description: 'Stop selling to the dump. Become the dump. Passive income.' },
];

export const getProperty = (id) => PROPERTIES.find((p) => p.id === id);
