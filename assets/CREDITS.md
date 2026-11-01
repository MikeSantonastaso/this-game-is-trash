# Asset credits

All assets are **CC0 1.0** (public domain). Credit isn't required, but it's deserved.

## Models by Quaternius

By **Quaternius** (https://quaternius.com).

| Folder | Source pack |
| --- | --- |
| `characters/` | Ultimate Modular Men Pack, Ultimate Modular Women Pack (rigged) |
| `nature/` | Ultimate Nature Pack |
| `props/` | Ultimate House Interior Pack (trash cans), Medieval Village Pack (benches, fence) |
| `street/` | Street Pack (streetlights, signs) |
| `buildings/` | Buildings Pack 3 |
| `trash/` | Survival Pack (cans, water bottles, gas can, propane tank) |
| `party/` | Ultimate House Interior Pack (couch, fridge, toilet, chair, table, stool, package), Medieval Village Pack (barrel, crate) |
| `props/Coin.glb` | Platformer Game Pack |

The files were taken from the pack mirror at github.com/trebeljahr/quaternius-showcase,
which lists each pack's license in its `LICENSES.md`.

## Models and sounds by Kenney

By **Kenney** (https://kenney.nl), CC0, taken from Kenney's open-source starter kits
(github.com/KenneyNL/Starter-Kit-Racing and Starter-Kit-City-Builder; the kits' code is MIT,
their assets are CC0).

- `models/vehicles/pickup.glb` + `models/vehicles/Textures/colormap.png`: the red pickup from the racing kit.
- `audio/*.mp3`: engine, skid, impact, break, land, jump, fall (racing kit) and coin, placement,
  removal, toggle (city builder kit), converted from OGG.

Other sounds (cha-ching, whoosh, glug, horn, scratch) are synthesized at
runtime with Web Audio in `src/audio/Sfx.js`.

## Textures

The textures in `assets/textures/` are from **ambientCG** (https://ambientcg.com), released under
**CC0 1.0**: Grass004, Ground054, Asphalt010, Concrete034, PavingStones070 (1K, color/normal/roughness,
resized to JPEG).

Libraries: three.js (MIT), cannon-es (MIT), Trystero (MIT). See `vendor/*.LICENSE`.
