import * as T from './assets/three.module.js';
import { loadUruk } from './uruk-model.js';



const viewport = document.querySelector('#viewport');
const intro = document.querySelector('#intro');
const start = document.querySelector('#start');
const fallback = document.querySelector('#fallback');
const instructions = document.querySelector('.intro-copy');
const place = document.querySelector('#place');
const trail = document.querySelector('#trail');
const reset = document.querySelector('#reset');
const quality = document.querySelector('#quality');

async function boot() {
  const mobile = matchMedia('(pointer: coarse)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', '可游览的乌鲁克城');
  viewport.append(renderer.domElement);
  const canvas = renderer.domElement;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(63, 1, .058, 295);
  camera.rotation.order = 'YXZ';
  camera.layers.enable(1);
  const city = await loadUruk(scene, renderer);

  const keys = new Set();
  const touchKeys = new Map();
  const player = new T.Vector3();
  const speed = new T.Vector2();
  let playing = false;
  let dragging;
  let high = !mobile.matches;
  let renderScale = 1;
  let frameTimes = [];
  let lastScaleChange = 0;
  let yaw, tilt, step, lastTime;
  let frame = 0;
  let location = '';
  let renderPending = true;

  function applyQuality() {
    quality.textContent = high ? '高画质' : '流畅画质';
    quality.setAttribute('aria-pressed', String(high));
    city.crowd.setQuality(high);
    city.sun.shadow.needsUpdate = true;
    city.water.material.uniforms.detailed.value = Number(high);
    renderer.shadowMap.enabled = true;
    const resolution = high ? 3072 : 1536;
    if (city.sun.shadow.mapSize.x !== resolution) {
      city.sun.shadow.mapSize.set(resolution, resolution);
      city.sun.shadow.map?.dispose();
      city.sun.shadow.map = null;
      city.sun.shadow.needsUpdate = true;
    }
    resize();
  }

  function resize() {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.fov = w / h < .75 ? 72 : 59;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, high ? 1.42 : 1) * renderScale);
    renderer.setSize(w, h, false);
    renderPending = true;
  }

  function label() {
    const [next, description] = city.landmark(player.x, player.z);
    if (next === location) return;
    location = next;
    place.textContent = next;
    trail.textContent = description;
  }

  function resetPlayer() {
    player.set(-1.14, 1.68, 21.55);
    speed.set(0, 0);
    step = 0;
    yaw = -.091;
    tilt = .126;
    camera.position.copy(player);
    camera.rotation.set(tilt, yaw, 0);
    label();
    renderPending = true;
  }

  function look(dx, dy, sensitivity) {
    yaw -= dx * sensitivity;
    tilt = T.MathUtils.clamp(tilt - dy * sensitivity, -1.36, 1.36);
  }

  function canMove(x,z,radius) {
    return city.canStand(x,z,radius,player.x,player.z) &&
      city.crowd.canPass(x,z,city.floorHeight(x,z),radius,player.x,player.z);
  }

  function walk(dt) {
    const pressed = key => keys.has(key) || [...touchKeys.values()].includes(key);
    const side = Number(pressed('KeyD')) - Number(pressed('KeyA'));
    const ahead = Number(pressed('KeyW') || pressed('ArrowUp')) - Number(pressed('KeyS') || pressed('ArrowDown'));
    const turn = Number(pressed('ArrowLeft')) - Number(pressed('ArrowRight'));
    yaw += turn * dt * 1.45;

    const rate = pressed('ShiftLeft') || pressed('ShiftRight') ? 5.35 : 3.25;
    const stride = rate / Math.max(1, Math.hypot(side, ahead));
    const dx = (side * Math.cos(yaw) - ahead * Math.sin(yaw)) * stride;
    const dz = (-side * Math.sin(yaw) - ahead * Math.cos(yaw)) * stride;
    const response = 1 - Math.exp(-dt * 16);
    speed.x += (dx - speed.x) * response;
    speed.y += (dz - speed.y) * response;
    const radius = .30;
    const newX = player.x + speed.x * dt, newZ = player.z + speed.y * dt;
    if (canMove(newX, player.z, radius)) player.x = newX;
    if (canMove(player.x, newZ, radius)) player.z = newZ;

    player.y += (city.floorHeight(player.x, player.z) + 1.68 - player.y) * response;
    step += Math.hypot(speed.x, speed.y) * dt * 5.2;
    const bob = reduced.matches ? 0 : Math.sin(step) * .012 * Math.min(1.6, speed.length() / 2.8);
    camera.position.copy(player);
    camera.position.y += bob;
    camera.rotation.set(tilt, yaw, 0);
    label();
  }

  function animate(t) {
    const previousFrame = lastTime ?? t;
    const dt = Math.min(Math.max((t - previousFrame) / 1000, 0), .065);
    lastTime = t;
    if (playing && !document.hidden) {
      walk(dt);
      const elapsed = (t - previousFrame) || 0;
      if (elapsed > 0 && elapsed < 180) frameTimes.push(elapsed);
      if (frameTimes.length >= 42 && t - lastScaleChange > 1300) {
        const average = frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length;
        const desired = average > 25 ? Math.max(.59, renderScale - .12)
          : average < 16.0 ? Math.min(1, renderScale + .06) : renderScale;
        frameTimes = [];
        if (desired !== renderScale) {
          renderScale = desired;
          lastScaleChange = t;
          resize();
        }
      }
    }
    if (!document.hidden && (playing || renderPending)) {
      city.water.material.uniforms.time.value = t / 1000;
      if (city.crowd.update(t,camera)) city.sun.shadow.needsUpdate = true;
      renderer.render(scene, camera);
      renderPending = false;
    }
    frame = requestAnimationFrame(animate);
  }

  function lock() {
    if (typeof canvas.requestPointerLock !== 'function') return;
    try {
      const request = canvas.requestPointerLock();
      request?.catch(() => {});
    } catch {
      // Pointer capture below also supports camera rotation.
    }
  }

  start.addEventListener('click', () => {
    intro.hidden = true;
    playing = true;
    resetPlayer();
    instructions.textContent = '';
    if (!mobile.matches) lock();
  });

  document.addEventListener('pointerlockchange', () => {
    keys.clear();
    document.querySelector('#journey').classList.toggle('locked', document.pointerLockElement === canvas);
  });
  document.addEventListener('mousemove', event => {
    if (document.pointerLockElement === canvas) look(event.movementX, event.movementY, .002);
  });

  canvas.addEventListener('pointerdown', event => {
    if (!playing || event.button !== 0 || document.pointerLockElement === canvas) return;
    if (event.pointerType === 'mouse') lock();
    dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (dragging?.id !== event.pointerId || document.pointerLockElement === canvas) return;
    look(event.clientX - dragging.x, event.clientY - dragging.y, .004);
    dragging.x = event.clientX;
    dragging.y = event.clientY;
  });
  const release = event => { if (dragging?.id === event.pointerId) dragging = null; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);

  const allowed = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  window.addEventListener('keydown', event => {
    if (!playing || !allowed.has(event.code) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code.startsWith('Arrow')) event.preventDefault();
    keys.add(event.code);
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  function releaseAll() { keys.clear(); touchKeys.clear(); }
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', releaseAll);
  document.querySelectorAll('.touch button').forEach(button => {
    button.addEventListener('pointerdown', event => {
      if (!playing) return;
      button.setPointerCapture(event.pointerId);
      touchKeys.set(event.pointerId, button.dataset.key);
      event.preventDefault();
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(name, event => touchKeys.delete(event.pointerId));
    }
  });

  quality.addEventListener('click', () => {
    high = !high;
    renderScale = 1;
    frameTimes = [];
    lastScaleChange = performance.now();
    applyQuality();
  });
  reset.addEventListener('click', resetPlayer);
  window.addEventListener('resize', resize);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    playing = false;
    releaseAll();
    if (document.pointerLockElement) document.exitPointerLock();
    intro.hidden = false;
    start.hidden = true;
    fallback.hidden = false;
    instructions.textContent = '浏览器暂时无法绘制 3D 场景。可刷新后重试，或回到全景。';
    cancelAnimationFrame(frame);
  });

  resetPlayer();
  applyQuality();
  camera.position.set(-6.66,1.06,30.10);
  camera.lookAt(-2.8,4.69,-1.7);
  city.crowd.update(performance.now(),camera);
  await renderer.compileAsync(scene, camera);
  renderer.render(scene, camera);
  start.disabled = false;
  start.textContent = '开始漫游';
  city.loadDistance().then(loaded=>{ if(loaded) renderPending=true; });
  frame = requestAnimationFrame(animate);
}

boot().catch(error => {
  console.error(error);
  document.querySelector('canvas')?.remove();
  start.hidden = true;
  fallback.hidden = false;
  instructions.textContent = '当前浏览器没能载入 3D 场景。你仍然可以返回全景看这座城。';
});

