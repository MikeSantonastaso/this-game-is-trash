# This Game Is Trash

Online co-op chaos for 1-4 friends on one small, hand-built block. Pick up trash, fill
your bag, sell it at the dumpster, buy better pickers. Also: grab your friends and throw
them in the dumpster, punch them, crash the truck into them, get drunk at the block party
and blow the crew's money on Scratch-Its.

It's a browser game: [Three.js](https://threejs.org) for rendering,
[cannon-es](https://github.com/pmndrs/cannon-es) for physics and ragdolls, and
[Trystero](https://github.com/dmotz/trystero) for serverless peer-to-peer multiplayer.
Models and sounds are CC0 from [Quaternius](https://quaternius.com) and
[Kenney](https://kenney.nl) (see `assets/CREDITS.md`). No build step, so it runs as a static
site on GitHub Pages.

## Play it

**With friends:** one person clicks **Host a game** and gets a room code (top left, with a
*Copy invite link* button). Everyone else opens the invite link, or types the code and
clicks **Join**. Up to 4 players. Works in desktop Chrome, Edge and Firefox.

**Solo:** click **Play solo**.

**Locally**

```bash
npm start          # zero-dependency static server -> http://localhost:8080
```

Any static server works (`python3 -m http.server`...). Opening `index.html` straight from disk
won't work because browsers block ES modules on `file://`. On a slow laptop add `?quality=low`
to the URL (no shadows or post-processing, thinner grass).

**GitHub Pages**: Settings → Pages → *Deploy from a branch* → `main` / `(root)`. All libraries
are vendored in `/vendor`.

### Controls

| Key | Action |
| --- | --- |
| WASD / Shift / Space / Mouse | Move / sprint / jump / look (click to lock the mouse) |
| Left click (hold) | Pick up trash with the picker. While holding something: throw it (Shift = harder) |
| E or Right click | Grab or drop anything physical: trash, bags, couches, Gary, **your friends** |
| Q or Middle click | Punch / shove. 3 quick hits, or one sprinting punch, knocks a friend out |
| F | Use: sell at the dumpster, Trash Mart, curb bins, beer cooler, Scratch-It machine, load or drive the truck |
| B / G | Tie off your bag / throw a tied bag (land it in the dumpster or the truck bed) |
| R | Go ragdoll / get up. Mash it to break free when someone is carrying you |
| H | Controls panel |

**Truck:** W/S drive, A/D steer, Space brake, Q horn, E sells the whole load next to the
dumpster, F gets out, R ejects you through the windshield. Crash hard enough and you get
ejected anyway.

## The block

`src/data/block.js` lays out everything by hand, in meters (about 100 m × 70 m):

- **Rubbish Road** runs through the middle, with houses on both sides and an alley behind.
  Curb bins at most houses (F empties one into your bag, or knock it over).
- **Trash Mart** on the corner: pickers, upgrades and crew stats, plus the **Scratch-It**
  machine out front ($25 a ticket, up to $2,000).
- **The block party** in the yellow house's yard: beer cooler (each beer makes you
  wobblier and leaves a can on the ground), grill, couch, toilet and other things to throw.
- **Dump-n-Go yard**: the dumpster you sell to and the **Rusty Pickup**. Throw bags (or
  friends) into the dumpster or the truck bed. Dunking Gary pays $25, dunking a friend $50.
- A **plywood ramp** in the street.

## Multiplayer

- Joining by room code uses Trystero's Nostr strategy: peers find each other through public
  Nostr relays, then talk over WebRTC data channels. No game server to run.
- **Host-authoritative.** The host simulates the world (trash, props, bags, Gary, the
  dumpster, money and the crew's shop purchases) and sends snapshots at 20 Hz. Clients
  interpolate them with a 110 ms delay.
- Each player simulates their own character (sent at 30 Hz) so moving and picking feel
  instant, and the truck is simulated by whoever is driving it. Actions like pick, grab,
  throw, punch and sell are sent to the host, which validates them and broadcasts results.
- The crew shares one wallet and one set of tools and upgrades. The host's browser keeps the save.
- If the host leaves, the room ends.
- Some strict networks (symmetric NAT, some corporate Wi-Fi) block WebRTC without a TURN
  relay. Trystero accepts TURN servers in `src/net/Net.js` if that becomes a problem.

Testing on one machine: add `?net=local` to the URL and open two tabs. That uses a
`BroadcastChannel` instead of WebRTC.

## Architecture

```
index.html, style.css      page, lobby, HUD and shop markup
assets/models/             CC0 glTF models    assets/audio/  CC0 sounds    assets/textures/  CC0 PBR textures
vendor/                    three, three addons, cannon-es, trystero (npm run vendor)
src/
  main.js                  lobby: name, character, host / join / solo
  core/      Game.js (composition root, loop, networking glue), GameState.js (money and
             progression, pure), Assets.js, EventBus.js, SaveSystem.js
  data/      block.js (the map), trash.js, tools.js, upgrades.js, models.js   <- tune the game here
  net/       Net.js (Solo / Local / Trystero transports, room codes),
             Interp.js (snapshot buffers), Entities.js (networked trash, props, bags, ragdolls)
  sim/       HostSim.js: the authoritative world; handles every player action
  entities/  LocalPlayer.js (your character: walk, pick, grab, punch, drunk, drive),
             Avatar.js (other players: animated model, name tag, bag),
             Ragdoll.js, Truck.js, Viewmodel.js (first-person hands, picker, bag)
  systems/   PhysicsWorld.js (collision groups), Inventory.js (pure), Stats.js, CameraRig.js
  render/    Graphics.js, Fx.js (pickup and coin effects, dust, world text), Surfaces.js,
             GrassField.js, TrashModels.js
  audio/     Sfx.js (Kenney samples + Web Audio synths, positional)
  tools/     Grabber.js (physics hand: point-to-point constraint)
  world/     Block.js (builds the block from data/block.js), kit.js, builders/structures.js
  ui/        Hud.js, ShopUI.js, nameTag.js
tests/       node --test unit tests (npm test)
```

Design rules:

- **Content is data.** Trash, pickers, upgrades and the map are plain objects in `src/data/`.
- **The host owns the truth.** Anything shared lives in `HostSim`. Clients only predict
  their own character and the truck they're driving. New features are a new action
  (`act_<name>` in `HostSim`) and, if needed, a new `fx` event for everyone's effects.
- **Progression is pure.** `GameState` and `Inventory` have no rendering or physics and are
  unit-tested in Node.
- **Physics is behind a thin layer** (`PhysicsWorld`, `Ragdoll`, `Grabber`). Grabbable
  bodies carry `userData` (`kind`, `netId`, `grabbable`, `sellable`, `ragdoll`).

URL flags for testing: `?quality=low`, `?net=local`, `?auto=host|solo|join` (skip the lobby).

## Next up

- [ ] Playtest online with real friends; add a TURN fallback if anyone can't connect
- [ ] Host migration (today the room ends when the host leaves)
- [ ] Gamepad support
- [ ] More chaos: shopping carts, a garbage truck with a grabber arm, a porta-potty to lock friends in
- [ ] Gambling beyond Scratch-Its (a dice game at the party?), proper drinking games
- [ ] Cosmetics bought with crew money

`docs/PROGRESSION.md` is the earlier long-term design (zones, trucks, owning the dump). It's
on hold while the block is made fun first.
