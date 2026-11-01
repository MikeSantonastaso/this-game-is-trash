# Progression design

One big, continuous map. You can see almost all of it from the start, but most of
it is fenced off. Each zone opens when you meet its requirements: money, gear, and
eventually vehicles. The goal is the feeling of How to Fish's islands (new places
gated behind milestones) combined with PowerWash / Leaf Blower style equipment
tiers (better tools make the same job faster and the next job possible).

## The loop

1. Pick up trash, fill bags, sell at a dumpster.
2. Spend on tools and upgrades so each minute earns more.
3. Meet a zone's requirements and unlock it at its gate (or from Trash Mart).
4. New zones pay more per item and add a new way to collect: curbside bins,
   bigger routes, then vehicles that carry a whole route's worth of bags.
5. Later: own property (garage, garbage truck, the dump) for passive income.

Physics comedy runs through all of it: ragdolls, Gary the intern, throwing friends
into the dumpster or the back of the pickup, the garbage truck arm grabbing people.

## Zones

The map is about 500 m × 425 m. Park Ave runs east to west across the whole map,
and the rest is laid out around it:

```
 north (-z)
 ┌──────────────────────── DOWNTOWN (skyline, coming soon) ───────────────────────┐
 ├──── MAPLE COURT (small neighborhood) ─────┬──── OAKRIDGE HEIGHTS (big) ────────┤
 │  Maple St · Birch Ln · Elm Rd, cul-de-sacs │  3×3 street grid, Oak St, avenues   │
 ├════════════════ Park Ave ═════════════════╪═════════════════════════════════════┤
 │        DUMPY PARK (start) + motor pool     │                                     │
 └───────────────────────────────────────────┴─────────────────────────────────────┘
```

| # | Zone | Requirements to unlock | Pays | What's new |
|---|------|------------------------|------|------------|
| 1 | Dumpy Park | Free | 1× | Picker, bags, dumpster, Trash Mart, Gary |
| 2 | Maple Court (small neighborhood) | $1,000 fee · own Extendo-Picker · 20 bags sold | 1.6× | Curbside bins (empty a whole bin into your bag), cul-de-sacs, 2nd dumpster |
| 3 | Oakridge Heights (big neighborhood) | $6,000 fee · own Rusty Pickup · own Double-Claw | 2.5× | Whole blocks, long routes that need the truck, Trash Mart outlet |
| 4 | Downtown (city) | $50,000 fee · own Garbage Truck · own Trash Magnet | 4× | Alleys, commercial dumpsters, fleet (coming soon) |
| 5 | The Dump | $150,000 (property) | passive | Stop selling to the dump, become it (coming soon) |

Gates sit where roads cross a zone border: a boom barrier, a guard booth and a big
billboard listing that zone's requirements with live ✓ / ✗ marks. The rest of the
border is chain-link construction fence, solid until the zones on both sides are
open. Once you meet the requirements, walk up to the gate and press F to pay the
fee. The boom lifts and the fences between open zones come down.

Requirement types (all data in `src/data/zones.js`, checked by pure code in
`src/core/requirements.js`):

- `money`: a fee, paid when you unlock
- `tool`: own a tool tier
- `property`: own a vehicle or building
- `stat`: a lifetime stat (bags sold, items picked, Gary dunks...)

## Equipment tiers

| Tier | Tool | Cost | Notes |
|------|------|------|-------|
| 1 | Standard Picker | free | |
| 2 | Extendo-Picker 3000 | $150 | needed for Maple Court |
| 3 | Double-Claw Grabber | $650 | needed for Oakridge |
| 4 | Industrial Trash Magnet | $2,500 | auto-collect; needed for Downtown |
| 5 | Leaf-vac backpack | later | vacuums small trash |
| 6 | Trash cannon | later | shoots bags into the truck from range |

Upgrades (levelled, exponential cost): bag size, belt hooks, sneakers, haggling.

## Vehicles and property

| Item | Cost | Status | What it does |
|------|------|--------|--------------|
| Rusty Pickup | $4,000 | **playable** | Drive it (F at the door). Bed holds 12 bags: throw bags in or press F at the tailgate. Park next to a dumpster and press E to sell the load. Friends and Gary can ride in the bed (and fall out). Needed for Oakridge. |
| Garage | $3,000 | soon | Store vehicles, outfits |
| Garbage Truck w/ lifting arm | $30,000 | soon | Arm lifts curbside bins (and friends) into the hopper. Needed for Downtown. |
| Own the Dump | $150,000 | soon | Passive income, end goal |

## Economy targets

Rough pacing for a solo player, to tune against real playtests:

- Park: about $2 to $4 a second once the picker and haggling are upgraded. Maple
  Court opens after roughly 10 to 15 minutes.
- Maple Court: curb bins roughly double income. You can afford the pickup and the
  Double-Claw about 20 to 30 minutes in.
- Oakridge: trash pays 2.5×, but the routes are long, so the truck's 12-bag bed is
  what makes it pay. Downtown is the long goal at around $80k total spent.

Levers: `trashMax`, `respawnSeconds` and `valueMultiplier` per zone, curb bin
size and refill time, fees in `zones.js`, and costs in `tools.js`, `upgrades.js` and
`properties.js`.

## Co-op notes

Money and unlocks are shared (one GameState on the host). Each player has their
own bags. The pickup has one driver, and everyone else rides in the bed as a
ragdoll if they want to.
