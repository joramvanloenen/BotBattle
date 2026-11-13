# BotBattle
**Build • Test • Destroy.** A playable browser prototype of a 2D modular robot-combat sandbox.

## Play
Open **https://joramvanloenen.github.io/BotBattle/** once GitHub Pages has been enabled for this repository (Settings → Pages → Build and deployment → Source: GitHub Actions). Alternatively, use a local HTTP server (for example, python -m http.server 8000) and visit http://localhost:8000. Internet access is required to load Matter.js from jsDelivr.

## Gameplay
1. **BUILD** — pick components from the left library and click the grid to place them. Drag modules to reposition; select one to inspect, rotate, duplicate, delete or change its action group. Placement snaps to a 20px grid. Parts connect automatically to the nearest previously connected component within 116px; the assembly inspector warns about disconnected modules.
2. **TEST DRIVE** — instant live physics with your actual robot and a non-aggressive, destructible enemy target.
3. **BATTLE NPC** — fight Scrapjaw, a motorized NPC with a turret and local component health. Destroy its control core to win credits. Damaged wheels affect movement, broken joints release physical components and wreckage remains.
4. **SHOP** — unlock rockets, saws, lasers, thrusters and shields. Sandbox mode bypasses unlocks for unrestricted experimentation.

## Default desktop controls
| Control | Function |
| --- | --- |
| A / D | Drive left / right |
| Mouse | Aim connected guns |
| Left mouse button or J | Fire primary group |
| K | Fire secondary group |
| Space | Fire connected thrusters |
| L | Utility group: saws / servo hinges |
| Q / E | Rotate a selected component in editor |
| Delete | Remove selected component |
| Ctrl+Z | Undo editor change |
| Mouse wheel | Zoom |
| Escape | Leave simulation and return to workshop |

Use **CONTROLS** to remap gameplay keys; change each active part's control group in the inspector.

## Physics and damage model
- Matter.js rigid bodies with separate collision shapes and hit points **for every component**.
- Two-anchor fixed joints and single-anchor revolute joints for wheels, saws, servos and turret guns.
- Projectile segment sampling minimizes tunneling; impacts apply to components, not a global health bar.
- Joint health and structural breakage, individually damaged modules, physical recoil, detached debris and explosions.
- Connectivity check disables powered functions when a part is separated from its core.
- Wheels depend on actual contact friction; thrusters apply forces to actual connected bodies.
- Opponent AI drives, aims and shoots; a non-aggressive target is available in the Test Chamber.
- Browser-local persistent blueprint, key mappings, scrap credits and part unlocks.

## Scope
This is a first vertical slice, not a production game. No online multiplayer, no explicit wiring-graph editor, no deformation of metal, and simplified armor and energy behavior. Blueprints are stored locally in the current browser, not in a cloud account.

## Technology
HTML, CSS, Canvas 2D, Matter.js 0.20.0. No build tooling. GitHub Actions verifies JavaScript syntax and deploys static content.
