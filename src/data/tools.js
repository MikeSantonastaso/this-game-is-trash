// Equipment tiers. Each tool is a data record; the Picker system reads these
// stats so adding a tier is a data change, not a code change.
//
// reach       - meters from your chest you can pick from
// cooldown    - seconds between picks (hold the button to auto-repeat)
// pickCount   - items grabbed per pick (nearby extras are scooped too)
// autoRadius  - > 0 means it vacuums trash around you automatically
// valueBonus  - multiplier on sale value for trash picked with it
export const TOOLS = {
  picker_basic: {
    id: 'picker_basic', tier: 1, name: 'Standard Picker', cost: 0,
    description: 'A sad stick with a claw. It works. Mostly.',
    reach: 2.4, cooldown: 0.4, pickCount: 1, autoRadius: 0, color: 0x9aa0a6,
  },
  picker_extendo: {
    id: 'picker_extendo', tier: 2, name: 'Extendo-Picker 3000', cost: 150,
    description: 'Telescoping shaft. Pick trash from a safe, dignified distance.',
    reach: 3.8, cooldown: 0.3, pickCount: 1, autoRadius: 0, color: 0x2d9cdb,
  },
  picker_double: {
    id: 'picker_double', tier: 3, name: 'Double-Claw Grabber', cost: 650,
    description: 'Two claws, one stick. Scoops a second piece of nearby trash per pick.',
    reach: 4.0, cooldown: 0.25, pickCount: 2, autoRadius: 0, color: 0xf2994a,
  },
  trash_magnet: {
    id: 'trash_magnet', tier: 4, name: 'Industrial Trash Magnet', cost: 2500,
    description: 'Somehow magnetizes wrappers. Do not ask how. Auto-collects trash around you.',
    reach: 4.5, cooldown: 0.18, pickCount: 2, autoRadius: 2.8, color: 0xbb6bd9,
  },
  // Future tiers (not yet buyable): leaf-vac backpack, trash cannon, garbage truck arm.
};

export const TOOL_ORDER = ['picker_basic', 'picker_extendo', 'picker_double', 'trash_magnet'];
