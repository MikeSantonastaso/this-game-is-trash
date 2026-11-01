# This Game Is Trash

A co-op (eventually) trash-collecting progression sim with ragdoll physics.
Start with a sad little picker stick in a dirty park, fill bags, sell them at the
dumpster, buy better gear, and work your way up to garbage trucks, your own dump,
and the whole city. Also: grab your friends and throw them in the trash.

This repo is the **browser prototype**: JavaScript + [Three.js](https://threejs.org)
for rendering and [cannon-es](https://github.com/pmndrs/cannon-es) for physics.
No build step; it runs as a static site on GitHub Pages. The plan is to port to
Godot / Unity / Unreal once the loop is proven, so systems are kept small and
data-driven (see [Architecture](#architecture)).

## Play it

**Locally**

```bash
npm start          # zero-dependency static server -> http://localhost:8080
```

Any static server works (`python3 -m http.server`, VS Code Live Server...). Opening
`index.html` straight from disk won't work because browsers block ES modules on `file://`.

**GitHub Pages**: Settings → Pages → *Deploy from a branch* → `main` / `(root)`.
Three.js and cannon-es are vendored in `/vendor`, so there is no CDN or build involved.

### Controls

| Key | Action |
| --- | --- |
| WASD / Shift / Space | Move / sprint / jump |
| Mouse (click to lock), Arrow keys, Wheel | Look, zoom |
| Left click (hold to repeat) | Pick up trash with the picker / throw what you're holding |
| E or Right click | Grab or drop anything physical: trash, bags, **Gary** |
| B | Tie off your bag early |
| G | Throw a tied bag (land it in the dumpster to sell it) |
| F | Sell everything at the dumpster / open Trash Mart |
| R | Flop into a ragdoll / get back up |
| H | Toggle the controls panel |

## What's in this first playable

- **Dumpy Park**: one fenced starting area with trees, benches, paths, a launch ramp,
  a dumpster drop-off and the Trash Mart kiosk. ~55 pieces of trash, respawning over time.
- **Picker tool** with generous aim assist. Trash goes into your **bag**; a full bag is
  tied off automatically and hung on your **belt** (limited slots). When everything is
  full you have to go sell.
- **Selling**: press F at the dumpster, or throw bags / individual trash into it.
- **Trash Mart**: 4 picker tiers (Standard → Extendo → Double-Claw → Trash Magnet with
  auto-collect) and 4 levelled upgrades (bag size, belt slots, move speed, sale value).
  Areas and property (garage, pickup, garbage truck, owning the dump) are listed as
  coming soon so the long-term goals are visible.
- **Ragdoll physics**: press R to flop; hard landings flop you automatically. Gary the
  intern is a ragdoll NPC you can grab by any limb, carry, and throw. Dunking him in
  the dumpster pays a bonus.
- **Physics grabbing**: a kinematic "hand" joined to the grabbed body with a
  point-to-point constraint, so held things swing and dangle. This is the same
  mechanism planned for grabbing friends in co-op and for the truck's lifting arm.
- **Saving** to localStorage (autosave every 10s and after purchases/sales).

## Architecture

```
index.html, style.css      page, HUD and shop markup
vendor/                    three.module.min.js, cannon-es.js (npm run vendor to refresh)
src/
  main.js                  boot
  core/      Game.js (composition root + loop), GameState.js (progression, pure),
             EventBus.js, SaveSystem.js
  data/      trash.js, tools.js, upgrades.js, areas.js, properties.js   <- tune the game here
  systems/   PhysicsWorld.js (cannon wrapper, collision groups), Inventory.js (bags, pure),
             Stats.js, TrashSpawner.js, LooseBags.js, DropOff.js, ThirdPersonCamera.js
  entities/  Player.js, Ragdoll.js, CharacterModel.js
  tools/     Picker.js, Grabber.js
  input/     Input.js (raw devices), LocalInputSource.js (-> PlayerIntent)
  world/     AreaBuilder.js, builders/park.js, textures.js
  ui/        Hud.js, ShopUI.js, nameTag.js
tests/       node --test unit tests for progression and bag logic (npm test)
```

Design rules that keep co-op and the engine port cheap:

- **Content is data.** Trash types, tool tiers, upgrade curves, areas and property are
  plain objects in `src/data/`. Adding a tier or an area's spawn table is a data change.
  These map 1:1 to Godot Resources / Unity ScriptableObjects.
- **Progression is pure.** `GameState` and `Inventory` have no rendering or physics, so
  they're unit-tested in Node and are the obvious thing to sync/own on a co-op host.
- **Players are driven by intents.** A `Player` only reads a `PlayerIntent`
  (move, aim, pick, grab, flop...). Today `LocalInputSource` produces it from keyboard
  and mouse; a second local player, a gamepad, or a network peer just needs another source.
  `Game.players` is already a list.
- **Physics is behind a thin layer.** Everything engine-specific lives in
  `PhysicsWorld`, `Ragdoll` and `Grabber`. Every grabbable body carries `userData`
  (`kind`, `grabbable`, `sellable`, `ragdoll`), which is how pickers, hands and the
  dumpster decide what to do with it.
- **Areas are builders.** `world/builders/<area>.js` creates meshes and colliders and
  returns a layout (spawn, dumpster trigger, shop, spawn bounds). New areas plug in there.

## Roadmap

**Prototype (this repo)**
- [x] Starting park, picker, bags + belt, dumpster selling, Trash Mart
- [x] Tool tiers and levelled upgrades, save/load
- [x] Ragdoll foundation: flop, grab/carry/throw ragdolls and objects
- [ ] Sound effects (picker clack, bag tie, ragdoll thuds, Gary noises)
- [ ] Juice: dust puffs, bag-fill wobble, money fly-to-HUD
- [ ] Gamepad support
- [ ] Local co-op test: second `Player` on a gamepad, shared money
- [ ] Online co-op (WebRTC/WebSocket host-authoritative): sync GameState + player
      intents; ragdolls simulated by the host

**Areas**
1. Dumpy Park (starting area) ✅
2. Small Neighborhood: curbside bins, lawns, first vehicle
3. Big Neighborhood: whole blocks, garbage truck routes
4. The City: alleys, dumpsters, fleet management

**Equipment scaling**
- Pickers: Standard → Extendo → Double-Claw → Trash Magnet → leaf-vac backpack → trash cannon
- Bags → contractor bags → wheelie bin you push around
- Vehicles: wheelbarrow → rusty pickup (friends ride in the bed) → garbage truck

**Ownership**
- Garage: store vehicles/tools, cosmetic outfits
- Trucks: buy, upgrade, assign routes
- Own the dump: stop selling to it, become it, passive income

**Physics comedy (the point)**
- Grab friends by any limb, carry them, throw them into the dumpster / truck hopper
- Garbage truck with a lifting arm that grabs cans, and also grabs friends
  (reuses `Grabber` with the arm's claw as the anchor)
- Truck bed / compactor interactions, ragdoll-on-impact when hit by thrown objects

**Port**
- Once the loop is fun, port to Godot (or Unity/Unreal). `src/data` and the pure
  logic in `GameState` / `Inventory` port directly; physics and rendering get rewritten
  against the engine's own ragdoll/joint systems.
