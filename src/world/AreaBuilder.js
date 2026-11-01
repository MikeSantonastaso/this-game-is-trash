// Picks the right layout builder for an area. New areas (neighborhoods, city)
// add a builder here; gameplay only sees the returned layout object.
import { buildPark } from './builders/park.js';

const BUILDERS = { park: buildPark };

export function buildArea(ctx, area) {
  const builder = BUILDERS[area.builder];
  if (!builder) throw new Error(`No builder for area "${area.id}"`);
  return builder(ctx, area);
}
