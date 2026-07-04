# Space Core Progress

Last updated: 2026-07-03

## Game Vision

Space Core is a browser-based spaceship construction and combat game. The player builds a ship around a central core, launches into a large world map, collects loose parts, fights enemy ships by destroying their cores, and upgrades by preserving and collecting enemy pieces.

The design goal is closer to Cosmoteer-style ship control than direct arcade steering: engines, weapons, ammo logistics, and power routing are placed as ship parts, then selected and commanded during combat.

## How To Run

```sh
npm start
```

Default local URL:

```txt
http://127.0.0.1:4174/
```

The server also exposes LAN URLs through `server-info.json` for multiplayer sharing.

## How To Test

```sh
npm test
```

The autonomous browser suite starts the local server, opens `/?test=1`, resets the game to deterministic scenarios, and verifies construction, power, launch controls, weapon retargeting, private multiplayer rooms, trade/research, ammo routing, repair bots, shield recharge, and salvage collection.

On a fresh machine, install the Playwright Chromium browser once:

```sh
npm run test:e2e:install
```

## Current Tile Set

- Core: central ship piece; losing it means defeat.
- Ship Scaffold: base layer that supports blocks.
- Power Generator: block that provides power.
- Fusion Generator: research-locked stronger generator.
- Engine: block that provides thrust when powered and activated.
- Overdrive Engine: research-locked stronger engine.
- Quantum Thruster: research-locked extreme-thrust engine.
- Laser: aimable weapon that requires power.
- Shield Block: powered block that projects a visible shield bubble, blocks enemy projectiles entering that range, regenerates shield HP, and absorbs part of direct incoming damage for nearby blocks.
- Beam Laser: research-locked stronger, longer-range beam weapon.
- Pulse Laser: research-locked short-range rapid-fire beam weapon.
- Cannon: aimable projectile weapon that requires stored ammo.
- Long Cannon: research-locked long-range projectile weapon.
- Railgun: research-locked extreme-range high-damage projectile weapon.
- Ammo Factory: outputs ammo forward over time.
- Repair Bot Block: powered block that launches repair bots to repair nearby damaged ship parts while the ship is still and engines are off.
- Salvage Collector: powered block that reaches out to pull in one visible loose part or scrap piece at a time from long range.
- Rapid Ammo Factory: research-locked ammo factory with a faster output cycle.
- Conveyor Belt: moves ammo forward over time.
- Splitter Conveyor: powered conveyor that randomly routes ammo to one of three forward/side exits.
- Electric Cable: underlay that carries power and can sit beneath other parts.

Blocks cannot overlap other blocks. Underlays can sit underneath bases or blocks.

## Implemented Systems

- Construction grid with selectable palette, layer filters, inventory counts, erase mode, reset, and Done button.
- Rotation with `R` for rotatable parts. Lasers and cannons do not rotate.
- Larger construction board centered around the core.
- World mode with a large circular map split into an outer safer ring, a tougher middle ring, and a core boss zone.
- Camera centers on the player core and supports zoom in/out.
- World camera rotates with the player ship so ship-relative clicks stay usable while spinning.
- World map has a starfield background.
- Ship parts have distinct component graphics across palette previews, construction cells, world ships, cargo, and loose salvage.
- The world spawns a larger debris field with many more collectible blocks.
- New loose parts and enemy ships periodically spawn while the host/solo world simulation is running.
- A smaller number of friendly trader ships wander the world with wide yellow trade radii. Entering the radius shows a Trade button and opens a persistent five-slot exchange with paid full-stock refresh and half-price part selling.
- A build-menu Research button opens a larger grouped tech tree.
- The research view has four section tabs: Weapons, Mobility, Power, and Logistics.
- Research sections render as left-to-right prerequisite trees with clickable compact tech nodes and detail popups.
- Destroyed enemy cores drop scrap pickups in addition to releasing surviving ship pieces.
- Research projects unlock advanced technologies and cost both scrap and existing ship parts.
- Research projects can depend on earlier technologies, and several intermediate upgrades now affect weapons, engines, ammo flow, salvage, and power readouts.
- Research-locked player parts can be collected before unlock, but cannot be placed until the technology is researched.
- Enemy ships can use advanced weapons and engines before the player has unlocked those technologies.
- Build menu is locked when an enemy ship is nearby.
- Build-menu rotation now turns the whole engine/ammo-factory component graphic, not just the direction marker.
- The build palette lists stored parts; owned but unresearched parts stay visible with a Need research badge and cannot be placed.
- Piece inventory is based on collected parts rather than spending scrap for normal building.
- Power is network-based: generators provide limited output, connected consumers share available power by percentage of demand, and underpowered systems shut off.
- Clicking a placed power generator in the build grid reports that connected system's generated power, required power, consumer count, and supply percentage.
- Part descriptions show power output for generators and power draw for powered systems.
- Shield Blocks require power, display a circular shield range in world mode, delete enemy projectiles and diffuse hostile lasers that enter that range, lose shield charge from blocked shots, regenerate shield charge over time, and reduce direct incoming damage to nearby blocks by absorbing part of the hit into the shield bubble instead of the block's structural HP.
- Repair Bot Blocks require power and passively repair nearby damaged parts while the player ship is still and no engines are active.
- Loose pieces and scrap within a generous scaffold collection range are collected into inventory.
- Salvage Collectors pull in one distant loose piece or scrap pickup at a time if no ship block or other loose blocking part is between the collector and the target.
- Destroying an enemy core releases remaining enemy ship pieces for collection.
- Ship movement uses selected engines and On/Off commands.
- Engine placement and active engines affect thrust and turning.
- Control groups: select engines or weapons, press `G` then a number to save; press the number to select that group.
- Clicking empty world space clears current selection when engines are selected or no weapon order is active.
- Weapons are selected directly on the ship, then aimed by clicking a world location.
- Weapons have cooldowns: lasers are faster, cannons are slower.
- Lasers fire beams; cannons spawn projectiles.
- Cannons store and consume ammo.
- Ammo factories, conveyor belts, and splitter conveyors move ammo into conveyors/cannons.
- Shots collide with enemy parts and random floating pieces.
- Shots do not pass through the player's own blocking ship parts.
- Scaffolding and electric cables do not block shots.
- Lasers and cannons have range limits.
- Parts have HP, including scaffolding.
- Damaged parts show health bars: green above 50%, orange above 25%, red below 25%.
- Enemy ships are built from the same part system as the player ship, with coherent layouts, enough generator output for their installed systems, real ammo logistics for cannon weapons, and powered engines/weapons that can fail if their generators are destroyed.
- Multiple enemy ships spawn in the world, with easier outer-ring ships, tougher middle-ring ships, and core-zone boss guards.
- Enemy ships use varied templates such as raiders, bruisers, beam wings, artillery ships, carriers, skirmishers, and dread-style ships.
- Enemy AI can activate engines to turn toward nearby targets and fire weapons.
- Enemy ships are hostile to each other as well as the player.
- Enemy AI acts slowly and starts far from the player.
- Basic multiplayer server exists using WebSockets.
- Multiplayer shows remote players as ships on the same map.
- Multiplayer can send player snapshots and damage events.
- Multiplayer hosts own the shared enemy/material simulation and guests render that shared world.
- Build-menu Save & Quit persists local progress and leaves multiplayer sessions cleanly.
- Playwright-based autonomous browser tests cover deterministic construction, world controls, weapon retargeting, trade/research, and core support systems without manual playtesting.
- New players see a first-run tutorial with basics for building, power, movement, combat, salvage, trade, and research. Completing or skipping it opens a main menu.
- The main menu can start the single-player game, create a private multiplayer room code, or join a private room code. Public multiplayer remains a placeholder.
- Scaffold removal now preserves direct base connectivity to the core; players must deconstruct outward pieces first if removing a scaffold would orphan part of the hull.

## Current Controls

- `R`: rotate selected rotatable build tile.
- Done: launch from construction to world.
- Research: open the tech tree in the build menu.
- Build: return to construction when no enemy is nearby.
- Zoom buttons: adjust world zoom.
- Click engine: select/deselect engine.
- On/Off buttons: turn selected engines on/off.
- Click weapon: select/deselect weapon.
- Click world with weapon selected: set fire target.
- `G` then number: save selected engines/weapons to a control group.
- Number: select a saved control group.
- Escape: clear world selection or leave erase mode in construction.
- Escape: close the tech tree when it is open.

## Recent Work

- Added a visible weapon target marker to show the active fire order.
- Changed weapon retargeting to use a `pointerdown` handler so retarget orders happen before world redraws can swallow a normal click.
- Kept click-to-clear behavior separate from weapon targeting so weapon selection is not cleared when firing into empty space.
- Avoided full world DOM rebuilds for normal laser fire and retargets; only structural hits rebuild the map, which keeps rotated-camera firing stable.
- Added host-owned shared world state for multiplayer so guests do not spawn private enemies/materials after closing the initial build screen.
- Hardened the WebSocket server against client reload/disconnect errors.
- Added build-menu-only Save & Quit support.
- Added CSS-driven part graphics for core, scaffold, generator, engine, laser, cannon, ammo factory, conveyor, and cable pieces.
- Added four enemy ships, expanded scattered world debris, and migrated old single-enemy saves into the new multi-enemy world.
- Enemy targeting and hit logic now supports enemy-vs-enemy combat.
- Added periodic shared-world spawning, scrap drops, trader ships, and research unlocks for Beam Laser, Long Cannon, Overdrive Engine, Pulse Laser, Railgun, Fusion Generator, Rapid Ammo Factory, and Quantum Thruster.
- Removed the old build-menu research list so research options only appear in the Research tech tree.
- Fixed the Research button's tech tree modal so all research nodes render in the tree instead of opening an empty panel.
- Removed the construction-side inventory readout; the left build palette now carries available-part counts.
- Reworked the research modal from grouped lists into a tabbed left-to-right tech tree with prerequisites and tech detail popups.
- Added intermediate research nodes across Weapons, Mobility, Power, and Logistics, expanding the tree to 35 technologies.
- Wired passive research effects into player weapon range/damage/reload, engine thrust/damping, ammo routing, scrap rewards, and power output readouts.
- Added more late/intermediate techs such as Focused Optics, Burst Cyclers, Kinetic Penetrators, Mass Balancing, Micro-Jump Plating, Plasma Regulators, Depot Grids, and Factory Overclock.
- Replaced the repeated enemy frame with several distinct enemy ship templates and spawn variants.
- Slowed ship movement substantially by reducing thrust, turn torque, and drift/rotation persistence.
- Reworked power from unlimited cable connectivity into finite generator networks with generated/required readouts and powered-system requirements.
- Buffed cannon projectile speed and cooldowns so cannon shots can actually threaten moving ships.
- Rotating engines and ammo factories in the build menu now rotates the full part art.
- Added Shield Blocks and Repair Bot Blocks, including starting inventory, trader stock, salvage spawning, powered world visuals, shield projectile interception, shield HP regeneration, shield absorption, and still-ship passive repair behavior.
- Build palette entries now show collected-but-unresearched parts with a Need research badge instead of hiding them.
- Power research descriptions now describe generator output directly instead of referring to build readouts.
- Enlarged the shield bubble and clipped it as a true circular field.
- Replaced the old build-menu trader with in-world trader ships. Traders show a yellow trade radius, offer five persistent stock slots with a rare artifact chance, refresh only the bought slot, attack enemy ships, and become hostile to the player if attacked.
- Shield collapse no longer removes the Shield Block; shield charge is separate from the block's structural HP and can regenerate after collapse.
- Reduced trader count, gave traders lightweight random wandering, increased max zoom-out, and pruned stale collected/destroyed entities plus old effects/projectiles to reduce long-session lag.
- Increased normal pickup range and added the Salvage Collector block with long-range line-of-sight pickup.
- Fixed fully zoomed-out world rendering by adding a camera-anchored padded starfield backdrop so newly exposed areas do not show edge/compositor artifacts.
- Changed the map into a circular play space with colored outer, middle, and core zone borders; the player starts in the outer ring, middle/core enemies stay in their zones, and a boss ship anchors the core.
- Enlarged the circular world and all three zones substantially, then limited periodic spawns to a local radius around active player ships so far-off map areas do not generate irrelevant activity.
- Distant NPC ships outside the active simulation radius now stop receiving AI/engine updates until a player gets close enough again.
- Fixed the large-map performance regression by shrinking the transformed world container to a coordinate origin, replacing the full-map starfield layer with a camera-local patch, removing expensive large-ring shadows, culling rendered world objects to a nearby radius, and only rendering colored zone borders when they are close enough to be visible.
- Rebuilt enemy templates into more coherent powered ships and made NPC engines/weapons obey finite ship power.
- Fixed hostile laser beams bypassing shield bubbles by making beams hit the shield circle entry point before damaging protected ship parts.
- Added sparse periodic trader spawning, a paid trader stock refresh button, and selling stored parts to traders for 50% of base value, including multiplayer request/result relay support.
- Added the Splitter Conveyor part, including placement state, ammo routing, trader/loose-piece availability, ammo badges, and distinct graphics.
- Removed invisible NPC cannon auto-reloads; active enemy and trader ships now feed their cannons through ammo factories, conveyors, and splitter conveyors.
- Rebuilt enemy and trader ship templates again so cannons have directed ammo routes, weapons sit on connected hulls, front-facing weapons are not blocked by their own parts, and all tested templates have enough power.
- Added an opt-in `?test=1` game harness plus Playwright tests for construction placement/power, launch and engine controls, weapon retargeting, trader exchange/research, ammo routing, repair bots, shield recharge, and salvage collectors.
- Added a first-run tutorial, skip path, main menu, single-player start button, private room creation/joining, and a placeholder public multiplayer button.
- Replaced the single global multiplayer server state with code-based rooms, including room-local hosts, peers, shared world state, trade relays, damage relays, and fragmented WebSocket frame handling for large packets.
- Prevented scaffold deletion from leaving disconnected hull islands and added an autonomous regression test for the blocked deconstruction message.

## Known Issues And Risks

- Weapon retargeting and rotated firing now pass a focused browser repro, but still need a longer manual playtest in real combat.
- Cannon projectiles already in flight keep their original direction after retargeting. This is intended physics, but it can make retargeting look broken if the player expects existing shots to turn.
- Enemy and player laser effects can overlap visually, which can make it hard to tell which ship fired during testing.
- Multiplayer is still early. The host owns shared enemies/materials, but snapshots and damage are not a fully authoritative combat server yet.
- Multiplayer only works for friends who can reach the host machine's LAN address and are on the same network or routing setup.
- Build balance is rough: inventory counts, enemy distance, AI speed, cooldowns, range, damage, and HP are all placeholder values.
- Trader/research balance is first-pass only; scrap income, trader prices, artifact odds, and part costs need playtesting.
- Shield Block range, projectile shield damage, regeneration, direct absorption, repair radius, repair rate, and power draw are first-pass balance values and need combat playtesting.

## Main Files

- `index.html`: app layout and script/style loading.
- `server.js`: static file server, LAN URL metadata, and WebSocket multiplayer relay.
- `js/app.js`: main state, construction/world mode flow, input handling, selection, control groups, multiplayer client coordination.
- `js/world.js`: world simulation, movement, enemy AI, weapon firing, ammo movement, collisions, collection, damage.
- `js/renderers.js`: DOM rendering for construction, world ships, pieces, effects, health bars, and target marker.
- `js/config.js`: board size, world size, inventory, physics, cooldown, damage, HP, and range constants.
- `js/tiles.js`: tile catalog.
- `js/placement.js`: construction placement rules.
- `js/power.js`: power calculation.
- `js/multiplayer.js`: browser WebSocket client.
- `styles/world.css`: world map, ship parts, effects, projectiles, health bars, and target marker styling.
- `styles/menu.css`: tutorial and main menu styling.
- `playwright.config.js`: autonomous browser test runner configuration.
- `tests/e2e/`: Playwright specs and game harness helpers for deterministic feature testing.

## Suggested Next Steps

1. Add a public room browser that lists opt-in public rooms from the server.
2. Add focused enemy-template validation tests so every generated NPC layout keeps power, ammo routes, and weapon lines of fire healthy.
3. Improve visual ownership of shots so player and enemy beams/projectiles are easier to distinguish.
4. Make multiplayer clearer: show whether the displayed connection target is local-only, LAN-reachable, or public-hosted.
5. Continue balancing enemy AI movement, weapon ranges, ammo flow, and part HP.
