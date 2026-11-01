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
On a slow laptop, add `?quality=low` to the URL to turn off shadows.

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
| F | Sell everything at the dumpster / open Trash Mart |
| R | Go ragdoll (camera pulls out to watch you tumble) / get back up |
| H | Toggle the controls panel |

## What's in this first playable

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
- **Saving** to localStorage (autosave every 10s and after purchases/sales).

## Architecture

```
index.html, style.css      page, HUD and shop markup
assets/models/             CC0 glTF models (see assets/CREDITS.md)
vendor/                    three.module.min.js, GLTFLoader/SkeletonUtils, cannon-es.js (npm run vendor)
src/
  main.js                  boot
  core/      Game.js (composition root + loop), GameState.js (progression, pure),
             Assets.js (glTF loading, normalizing, instancing), EventBus.js, SaveSystem.js
  data/      trash.js, tools.js, upgrades.js, areas.js, properties.js, models.js   <- tune the game here
  systems/   PhysicsWorld.js (cannon wrapper, collision groups), Inventory.js (bags, pure),
             Stats.js, TrashSpawner.js, LooseBags.js, DropOff.js, CameraRig.js (first/chase)
  entities/  Player.js, Ragdoll.js (skinned), Viewmodel.js (first-person hands + picker)
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
