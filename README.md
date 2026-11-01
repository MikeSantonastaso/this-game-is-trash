# This Game Is Trash

A co-op (eventually) trash-collecting progression sim with ragdoll physics.
Start with a sad little picker stick in a dirty park, fill bags, sell them at the
dumpster, buy better gear, and work your way up to garbage trucks, your own dump,
and the whole city. Also: grab your friends and throw them in the trash.

This repo is the **browser prototype**: a first-person game in JavaScript +
[Three.js](https://threejs.org) for rendering and [cannon-es](https://github.com/pmndrs/cannon-es)
for physics, with CC0 low-poly models by [Quaternius](https://quaternius.com) (see `assets/CREDITS.md`).
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
On a slow laptop, add `?quality=low` to the URL. It turns off shadows and post-processing
and thins the grass.

**GitHub Pages**: Settings → Pages → *Deploy from a branch* → `main` / `(root)`.
Three.js and cannon-es are vendored in `/vendor`, so there is no CDN or build involved.

### Controls

| Key | Action |
| --- | --- |
| WASD / Shift / Space | Move / sprint / jump |
| Mouse (click to lock), Arrow keys | Look (first person) |
| Wheel | Zoom the chase camera while you're a ragdoll |
| Left click (hold to repeat) | Pick up trash with the picker / throw what you're holding |
| E or Right click | Grab or drop anything physical: trash, bags, **Gary** |
| B | Tie off your bag early |
| G | Throw a tied bag (land it in the dumpster to sell it) |
| F | Use: sell at a dumpster, open Trash Mart, empty a curb bin, unlock a zone at its gate, buy / get in / get out of the truck, load bags into the truck bed |
| R | Go ragdoll (camera pulls out to watch you tumble) / get back up. In the truck: eject |
| M | Town map (there's also a minimap in the corner) |
| H | Toggle the controls panel |

**Driving the Rusty Pickup:** W/S throttle and reverse, A/D steer, Space brake, E sells the
whole load when you're parked next to a dumpster, F gets out.

## The map and zones

One big open map (about 500 m × 425 m) split into zones. You can see almost all of it
from the start, but most of it is fenced off. Each zone opens when you meet its requirements,
which are shown live (✓ / ✗) on a billboard at every gate. The full design is in
[docs/PROGRESSION.md](docs/PROGRESSION.md).

| Zone | To unlock | Trash pays |
| --- | --- | --- |
| 1. Dumpy Park | free | 1× |
| 2. Maple Court (small neighborhood) | $1,000 · own the Extendo-Picker · 20 bags sold | 1.6× |
| 3. Oakridge Heights (big neighborhood) | $6,000 · own the Rusty Pickup · own the Double-Claw | 2.5× |
| 4. Downtown (city skyline) | $50,000 · own the Garbage Truck · own the Trash Magnet (coming soon) | 4× |

- **Gates and fences**: chain-link construction fence along zone borders, with a boom
  barrier, guard booth and requirements billboard wherever a road crosses. Walk up and press F
  once the sign is all green. The boom lifts and the fences between open zones come down.
  You can also unlock zones from the Trash Mart's Zones tab.
- **Neighborhoods**: ~300 houses along real streets with sidewalks, driveways, cul-de-sacs
  and street trees, each with its own paint job. Most houses have a **curbside bin**: press F
  to dump the whole bin into your bag. Bins refill over time.
- **The Rusty Pickup** ($4,000, parked at the motor pool on Park Ave): an arcade truck that
  bumps into houses, launches Gary and goes off the ramp. The bed holds 12 bags: throw bags
  in (G) or press F at the tailgate. Park at any dumpster and press E to sell the load.
  Gary and friends can ride in the bed until they fall out.
- **Three dumpsters** (park, Maple Court, Oakridge) and a **Trash Mart Outlet** in Oakridge.
  Trash keeps the value of the zone it came from.
- **HUD**: current zone and its pay multiplier, a minimap, "now entering" banners, a full
  map on M.

## What was in the first playable

- **First person** on foot: you see your gloved hands and the picker. The camera
  switches to a chase view when you ragdoll; the same chase mode is meant for driving later.
- **Dumpy Park in an open world**: no walls. The park (trees, bushes, rocks, benches with
  tippable bins, lamps, paths, a launch ramp, the dumpster and the Trash Mart) sits beside a
  street of houses (the future Small Neighborhood), with meadow and forest rolling out to
  hills on the horizon. Walk far enough and you're gently turned back.
  ~55 pieces of trash, respawning over time.
- **Real models**: rigged Quaternius characters (you are the hi-vis Worker, Gary is the guy
  in the purple hoodie), nature, street and building packs. All CC0.
- **Picker tool** with generous aim assist. Trash goes into your **bag**; a full bag is
  tied off automatically and hung on your **belt** (limited slots). When everything is
  full you have to go sell.
- **Selling**: press F at the dumpster, or throw bags / individual trash into it.
- **Trash Mart**: 4 picker tiers (Standard → Extendo → Double-Claw → Trash Magnet with
  auto-collect) and 4 levelled upgrades (bag size, belt slots, move speed, sale value).
  Areas and property (garage, pickup, garbage truck, owning the dump) are listed as
  coming soon so the long-term goals are visible.
- **Ragdoll physics on real characters**: the ragdoll's bodies are measured from the
  model's skeleton and drive its bones, so any rigged humanoid with the same bone names
  works. Press R to flop; hard landings flop you automatically. Gary the intern is a ragdoll
  NPC you can grab by any limb, carry, and throw. Dunking him in the dumpster pays a bonus.
  Park bins are physics objects too: grab them, throw them.
- **Physics grabbing**: a kinematic "hand" joined to the grabbed body with a
  point-to-point constraint, so held things swing and dangle. This is the same
  mechanism planned for grabbing friends in co-op and for the truck's lifting arm.
- **Look**: a physical sky with matching environment light, soft shadows, ambient
  occlusion (GTAO), light bloom, ACES tone mapping and a color grade. Ground, paths, road and
  paving use real PBR textures (ambientCG, CC0). Lawns and meadows are instanced grass tufts
  swaying in the wind. Trash is modelled (branded cans, labelled bottles, cups with lids,
  foil wrappers, pizza boxes, tyres) with a few variants each. The HUD uses rounded navy
  panels: a bag-fill ring and belt in the top left, money in the top right, the tool in the
  bottom left.
- **Saving** to localStorage (autosave every 10s and after purchases/sales).

## Architecture

```
index.html, style.css      page, HUD and shop markup
assets/models/             CC0 glTF models (see assets/CREDITS.md)
assets/textures/           CC0 PBR textures (color, normal, roughness)
vendor/                    three.module.min.js, three addons (loaders, Sky, post-processing), cannon-es.js (npm run vendor)
src/
  main.js                  boot
  core/      Game.js (composition root + loop), GameState.js (progression, pure),
             requirements.js (zone unlock checks, pure),
             Assets.js (glTF loading, normalizing, instancing), EventBus.js, SaveSystem.js
  data/      zones.js (map, zones, roads, gates), trash.js, tools.js, upgrades.js,
             properties.js, models.js                                  <- tune the game here
  systems/   PhysicsWorld.js (cannon wrapper, collision groups), Inventory.js (bags, pure),
             Stats.js, TrashSpawner.js (per zone), LooseBags.js, DropOff.js (all dumpsters),
             Zones.js (locks, gates, signs), CurbBins.js, CameraRig.js (first/chase)
  render/    Graphics.js (renderer, sky, lights, post), Surfaces.js (PBR ground materials),
             GrassField.js (instanced wind grass), TrashModels.js (procedural trash meshes)
  entities/  Player.js, Ragdoll.js (skinned), Viewmodel.js (first-person hands + picker), Truck.js
  tools/     Picker.js, Grabber.js
  input/     Input.js (raw devices), LocalInputSource.js (-> PlayerIntent)
  world/     World.js (builds the whole map), kit.js (instancing, batching, colliders),
             builders/ roads, park, neighborhood, downtown, borders (fences + gates), structures
  docs/      PROGRESSION.md: zones, requirements, tiers, economy
  ui/        Hud.js, ShopUI.js, MapUI.js (minimap + full map), nameTag.js
tests/       node --test unit tests for progression, bags, zones and unlocks (npm test)
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
- **The map is data.** Zones, streets, gates and borders live in `src/data/zones.js`. The
  builders turn them into meshes and colliders; another suburb is mostly a data change
  (see `world/builders/neighborhood.js`).
- **Big but cheap.** Each model is merged into one vertex-colored geometry and drawn as
  instanced chunks; chunks far from the camera are hidden behind the fog.

## Roadmap

**Prototype (this repo)**
- [x] Starting park, picker, bags + belt, dumpster selling, Trash Mart
- [x] Tool tiers and levelled upgrades, save/load
- [x] Ragdoll foundation: flop, grab/carry/throw ragdolls and objects
- [x] First person, real CC0 models, open world around the park
- [ ] Walk/idle animations for other players' characters (needed for co-op; the
      Quaternius Universal Animation Library is CC0 and matches these rigs)
- [ ] Real trash models (cans, bottles, bags) to replace the primitive shapes
- [ ] Sound effects (picker clack, bag tie, ragdoll thuds, Gary noises)
- [ ] Juice: dust puffs, bag-fill wobble, money fly-to-HUD
- [ ] Gamepad support
- [ ] Local co-op test: second `Player` on a gamepad, shared money
- [ ] Online co-op (WebRTC/WebSocket host-authoritative): sync GameState + player
      intents; ragdolls simulated by the host

**Zones**
1. Dumpy Park (starting area) ✅
2. Maple Court, small neighborhood: curbside bins, cul-de-sacs ✅
3. Oakridge Heights, big neighborhood: whole blocks, truck routes ✅
4. Downtown: skyline and gates in place; alleys, commercial dumpsters, fleet management to come
5. The Dump: own it for passive income

**Equipment scaling**
- Pickers: Standard → Extendo → Double-Claw → Trash Magnet → leaf-vac backpack → trash cannon
- Bags → contractor bags → wheelie bin you push around
- Vehicles: wheelbarrow → rusty pickup (friends ride in the bed) ✅ → garbage truck

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
