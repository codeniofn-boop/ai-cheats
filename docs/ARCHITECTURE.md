# VALORANT-style FPS prototype — Architecture Contract

Pure browser prototype: **Three.js r160 (vendored at `vendor/three.module.js`), ES modules, no bundler, no build step.**
Serve the folder over HTTP (`python3 -m http.server 8080` or `npx serve`) and open `index.html`.
ES modules do not load from `file://`.

## Module ownership (one owner per file — never edit another module's file)

| File                 | Owner            | Purpose                                              |
|----------------------|------------------|------------------------------------------------------|
| `index.html`         | Agent 1 (Map+UI) | Page shell, importmap, HUD markup, start overlay     |
| `css/style.css`      | Agent 1 (Map+UI) | All HUD / overlay styling                            |
| `js/map.js`          | Agent 1 (Map+UI) | Procedural 3D map, lighting, sky, target dummies     |
| `js/ui.js`           | Agent 1 (Map+UI) | `HUD` class (health, ammo, kill feed, overlay, ...)  |
| `js/player.js`       | Agent 2 (Player) | `Player` class: pointer-lock look, WASD, physics, AABB collision |
| `js/weapon.js`       | Agent 3 (Weapon) | `WeaponSystem` class: guns, crosshair, recoil, raycast shooting, FX |
| `js/main.js`         | Coordinator      | Wires everything, game loop                          |
| `vendor/three.module.js` | Coordinator  | Three.js r160 (do not modify)                        |

## Global conventions

* Import Three.js **only** as `import * as THREE from 'three';` — the importmap in `index.html` maps
  `three` → `./vendor/three.module.js`. **No addons** (no OrbitControls, no GLTFLoader, no PointerLockControls),
  no external assets, no network requests. Everything procedural (geometry + materials + canvas textures).
* Units are metres. **Y is up.** Ground is the plane `y = 0`. Player eye height 1.6 m standing, 1.1 m crouched.
* `camera` is a `THREE.PerspectiveCamera` (fov 90-ish, near 0.05, far 500). `main.js` adds the camera to the scene
  (`scene.add(camera)`) so modules may parent objects to it (weapon view-model).
* Camera rotation uses `camera.rotation.order = 'YXZ'`; yaw = `rotation.y`, pitch = `rotation.x`. Only `player.js`
  writes camera yaw/pitch. Weapon recoil must **not** write camera.rotation directly — instead it calls
  `player.addRecoil(pitchRadians, yawRadians)` (see below), so the two systems never fight.
* Every module exposes plain ES classes/functions. No globals except for an optional `window.__game` debug handle set by `main.js`.
* All per-frame work goes through `update(dt)` (dt in seconds, clamped by main to ≤ 0.05).
* Renderer: `main.js` creates `THREE.WebGLRenderer({ antialias:true })`, enables `shadowMap` (PCFSoft),
  `outputColorSpace = THREE.SRGBColorSpace`, and appends `renderer.domElement` into `<div id="app">`.
* DOM layering (z-index): canvas 0 · HUD `#hud` 10 · crosshair `#crosshair` 20 · overlay `#overlay` 100.
  `#hud` and `#crosshair` use `pointer-events:none`.
* Syntax check before you finish: `node --check js/<yourfile>.js` must pass. No TypeScript, no JSX.

## `index.html` (Agent 1)

```html
<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Valorant Clone Prototype</title>
<link rel="stylesheet" href="./css/style.css">
<script type="importmap">{ "imports": { "three": "./vendor/three.module.js" } }</script>
</head><body>
<div id="app"></div>                 <!-- renderer canvas is appended here by main.js -->
<div id="hud"> ...HUD markup (see ui.js)... </div>
<div id="overlay"> ...start / paused screen; click anywhere on it to play (main.js handles the click) ... </div>
<script type="module" src="./js/main.js"></script>
</body></html>
```
Do **not** put a crosshair in the HTML — the weapon module creates `#crosshair` itself and appends it to `document.body`.

## `js/map.js` (Agent 1)

```js
import * as THREE from 'three';
export function createMap(scene) { ...; return map; }
```
`map` object:
```js
{
  colliders:   THREE.Box3[],   // world-space AABBs of every solid (walls, crates, ramps-as-steps, elevated floors).
                               // Do NOT include the y=0 ground; the player treats y=0 as the floor.
  shootables:  THREE.Mesh[],   // flat list of every mesh bullets can hit (walls, crates, floor mesh, dummy parts).
  targets:     THREE.Group[],  // shootable bot dummies (see below)
  spawnPoints: { attackers: THREE.Vector3[], defenders: THREE.Vector3[] }, // feet positions on the ground
  bounds:      THREE.Box3,     // playable area (player is clamped inside)
  update(dt),                  // per-frame: animates dummies, handles respawn timers
  hitTarget(targetGroup, damage) // -> { killed:boolean, hp:number }. Applies damage; on kill hides the dummy,
                                 //    respawns it after ~3 s with full hp at its original spot.
}
```
Target dummy = `THREE.Group` with `userData = { isTarget:true, name:'Bot 1', hp:100, maxHp:100, alive:true }`.
Children are meshes with `userData.part = 'head' | 'body' | 'legs'` (each child is also in `shootables`).
A head mesh must be a small sphere/box roughly 0.25 m wide sitting at ~1.6 m, body ~0.5 m wide × 0.8 m tall, legs below.
Place 6–8 dummies around the map at useful ranges (5 m – 40 m), some peeking around corners.

The map should read as a VALORANT-style site: a spawn area, a mid lane, A-site with boxes/crates, B-site,
some walls with doorways, a couple of elevated platforms with stairs (build stairs as 3–4 stacked steps so the
player's AABB collision can climb them), a spike plant zone marker, colour-blocked walls (team colours,
light grey floor with a grid canvas texture), hemisphere + directional light with shadows, fog, and a gradient sky.
All colliders must be axis-aligned boxes (rotate visuals only by 90°).

## `js/ui.js` (Agent 1)

```js
export class HUD {
  constructor();                       // queries nodes from index.html
  setHealth(hp, maxHp = 100);
  setArmor(armor);
  setAmmo(mag, reserve);
  setWeaponName(name);                 // e.g. 'VANDAL'
  setRoundTimer(seconds);              // formats m:ss
  setScore(kills, deaths);
  showHitMarker(isHeadshot = false);   // 120 ms white (or red for headshot) marker flash in the centre
  addKillFeed(text);                   // top-right feed, entries fade out after ~4 s
  showDamageFlash();                   // red vignette pulse
  showReloading(visible);              // 'RELOADING' label under crosshair
  showOverlay(visible, { title, subtitle } = {});  // start / paused screen
  setFps(fps);                         // small debug counter
  setMessage(text, ms = 1500);         // centre-screen transient message
}
```

## `js/player.js` (Agent 2)

```js
export class Player {
  constructor(camera, domElement, { colliders, spawn, bounds, sensitivity = 0.0022 });
  update(dt);
  get position();       // THREE.Vector3 — FEET position (camera is position + eyeHeight)
  get velocity();       // THREE.Vector3 (m/s)
  get isGrounded(); get isMoving(); get isSprinting()/isRunning(); get isWalking(); get isCrouching();
  get isLocked();       // pointer lock active
  lock(); unlock();
  onLock(cb); onUnlock(cb);
  respawn(positionVec3);
  addRecoil(pitchRad, yawRad);   // weapon kick: offsets pitch/yaw immediately (clamp pitch ±89°)
  get eyeHeight();
  hp, maxHp, takeDamage(n), heal(n), isDead;   // simple health state used by HUD
}
```
Default keys: `W A S D` move, `Space` jump, `Shift` (hold) walk silently/slowly, `Ctrl`/`C` crouch.
VALORANT-like tuning: run 5.4 m/s, walk 2.7 m/s, crouch 2.6 m/s, jump ≈ 1.0 m apex, gravity ≈ 25 m/s²,
accel/decel fast (near-instant start/stop, ~10 frames), air control reduced, no bunny hop speed gain.
Collision: player AABB half-extent 0.3 m, height 1.8 m (1.2 m crouched); resolve against `colliders` per
axis (move X, resolve; move Z, resolve; move Y, resolve) so sliding along walls works and small steps (≤ 0.35 m)
are auto-stepped. Floor is `y = 0`; tops of colliders are walkable. Clamp inside `bounds`.
Mouse look only while pointer-locked (`movementX/Y`), pitch clamp ±89°.

## `js/weapon.js` (Agent 3)

```js
export class WeaponSystem {
  constructor(camera, scene, { player, map, hud });   // map.shootables, map.targets, map.hitTarget(...)
  update(dt);
  setEnabled(enabled);                               // false while overlay is up
  get current();                                     // current weapon def
}
```
* Listens to `mousedown/mouseup` (left button) on `window` and only fires while `player.isLocked` and enabled.
  `R` reload, `1`/`2`/`3` switch weapon, mouse wheel cycles.
* Weapons (approx VALORANT stats): **Vandal** (auto, 9.75 rps, 25/75 ammo, 40 body / 160 head / 34 legs,
  no falloff), **Phantom** (auto, 11 rps, 30/90, 39/156/33), **Sheriff** (semi, 4 rps, 6/24, 55/160/47),
  **Classic** (semi, 6.75 rps, 12/36, 26/78/22). Start with Vandal.
* Spread/inaccuracy depends on `player` state: still+crouch < still < walking < running < in air;
  first-shot accuracy, then a rising recoil pattern (vertical climb then sideways wander) across the spray; recovers when not firing.
* Shooting = `THREE.Raycaster` from camera centre with spread applied; test against `map.shootables`
  (non-recursive). On hit: walk up `obj.parent` until an object with `userData.isTarget`; use the hit mesh's
  `userData.part` for damage; call `map.hitTarget(group, dmg)`; `hud.showHitMarker(part === 'head')`;
  if killed → `hud.addKillFeed('You  ▸  ' + group.userData.name + (head ? ' (HS)' : ''))` and increment a kill counter
  passed to `hud.setScore(kills, 0)`.
  On any hit: spawn a small bullet-hole decal (flat circle slightly offset along face normal, pooled, max ~60),
  and a brief tracer line + muzzle flash (point light + sprite) in front of the view-model.
* Recoil applies via `player.addRecoil(pitch, yaw)` — never write camera.rotation directly.
* View-model: a low-poly procedural gun (boxes/cylinders) parented to the camera at lower-right, with sway
  (mouse move), bob (while moving), kick on fire, reload animation (drop/rotate).
* Crosshair: creates `<div id="crosshair">` on `document.body` (fixed, centred, z-index 20, pointer-events none)
  styled like the VALORANT default (cyan/green 4-line crosshair with centre dot, 1 px black outlines); gap expands
  with spread/movement each frame, hides while `!player.isLocked`. Also shows `hud.setAmmo` / `hud.setWeaponName`.
