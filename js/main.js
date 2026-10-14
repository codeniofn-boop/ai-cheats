// Coordinator-owned entrypoint. Wires map, player, weapon and HUD together.
import * as THREE from 'three';
import { createMap } from './map.js';
import { HUD } from './ui.js';
import { Player } from './player.js';
import { WeaponSystem } from './weapon.js';

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.05, 500);
camera.rotation.order = 'YXZ';
scene.add(camera);

const hud = new HUD();
const map = createMap(scene);
const spawn = map.spawnPoints.attackers[0].clone();
const player = new Player(camera, renderer.domElement, { colliders: map.colliders, spawn, bounds: map.bounds });
const weapon = new WeaponSystem(camera, scene, { player, map, hud });

hud.setHealth(player.hp, player.maxHp);
hud.setScore(0, 0);
hud.showOverlay(true, { title: 'VALORANT CLONE', subtitle: 'Click to play' });
weapon.setEnabled(false);

player.onLock(() => { hud.showOverlay(false); weapon.setEnabled(true); });
player.onUnlock(() => { hud.showOverlay(true, { title: 'PAUSED', subtitle: 'Click to resume' }); weapon.setEnabled(false); });
document.getElementById('overlay').addEventListener('click', () => player.lock());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
let fpsAcc = 0, fpsFrames = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  player.update(dt);
  weapon.update(dt);
  map.update(dt);
  fpsAcc += dt; fpsFrames++;
  if (fpsAcc >= 0.5) { hud.setFps(Math.round(fpsFrames / fpsAcc)); fpsAcc = 0; fpsFrames = 0; }
  renderer.render(scene, camera);
}
loop();

window.__game = { THREE, scene, camera, renderer, map, player, weapon, hud };
