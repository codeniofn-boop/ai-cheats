# Valorant Clone Prototype (Three.js)

A browser-based 3D tactical-FPS prototype inspired by VALORANT, built with plain ES modules and
[Three.js r160](https://threejs.org/) (vendored, no build step, no network access required).

## Run

ES modules can't be loaded from `file://`, so serve the folder over HTTP:

```bash
python3 -m http.server 8080        # or: npx serve .
```

Then open <http://localhost:8080/> and click to lock the mouse.

## Controls

| Action        | Key              |
|---------------|------------------|
| Move          | `W` `A` `S` `D`  |
| Walk (quiet)  | hold `Shift`     |
| Crouch        | hold `Ctrl` / `C`|
| Jump          | `Space`          |
| Shoot         | Left mouse       |
| Reload        | `R`              |
| Weapons       | `1` Vandal · `2` Phantom · `3` Sheriff · `4` Classic · wheel cycles |
| Pause         | `Esc`            |

## Project layout

```
index.html            page shell, importmap, HUD + start overlay markup
css/style.css         HUD / overlay styling
js/main.js            entrypoint: renderer, scene, game loop, wiring
js/map.js             procedural map (sites, crates, stairs, lights, sky), target dummies, colliders
js/ui.js              HUD class (health, ammo, kill feed, hit marker, overlay, ...)
js/player.js          Player: pointer-lock look, WASD, jump/crouch/walk, gravity, AABB collision
js/weapon.js          WeaponSystem: guns, crosshair, spread/recoil, raycast hits, tracers, decals
vendor/three.module.js Three.js r160 (MIT)
docs/ARCHITECTURE.md  module contract the systems are built against
```

Built by a coordinated agent swarm: one agent per subsystem (map + UI, player physics, weapons),
working in parallel against the contract in `docs/ARCHITECTURE.md`.
