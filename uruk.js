"use strict";

const stops = [
  {
    id: "panorama",
    title: "乌鲁克",
    context: "苏美尔 · 约公元前 2700 年",
    description: "神庙高台之下，运河穿过泥砖城区，直抵双塔城门。",
    action: "乘船入城",
    position: [0.73, 0.84],
    water: 0.034
  },
  {
    id: "quay",
    title: "运河码头",
    context: "旅人视角 · 芦苇船",
    description: "芦苇船贴着岸边慢下来。码头上的人正卸下货篮，双塔在水道尽头升起。",
    action: "走向城门",
    position: [0.53, 0.62],
    water: 0.12
  },
  {
    id: "gate",
    title: "双塔城门",
    context: "旅人视角 · 城墙脚下",
    description: "两座泥砖塔挡住了晨光。透过门洞，能望见晒亮的街道和往来行人。",
    action: "回到全景",
    position: [0.56, 0.57],
    water: 0.023
  }
];

const experience = document.querySelector(".experience");
const world = document.querySelector("#world");
const views = [...world.querySelectorAll(".view")];
const panoramas = views.map(view => view.querySelector(".landscape"));
const route = [...document.querySelectorAll(".stop")];
const era = document.querySelector("#era");
const title = document.querySelector("#scene-title");
const description = document.querySelector("#scene-description");
const advance = document.querySelector("#advance");
const audio = document.querySelector("#audio");
const look = document.querySelector("#look-mode");
const fullscreen = document.querySelector("#fullscreen");
const notice = document.querySelector("#notice");
const mobile = matchMedia("(max-width: 600px)");

let selected = 0;
let gaze = defaultGaze();
let availableTravel = 0;
let drag;
let noticeTimer;
let cut = 0;

function defaultGaze() {
  return stops[selected].position[Number(mobile.matches)];
}

function placeView(index, position) {
  const photo = panoramas[index];
  if (!photo.naturalWidth) return;
  const w = world.clientWidth;
  const h = world.clientHeight;
  const scale = Math.max(w / photo.naturalWidth, h / photo.naturalHeight) * 1.035;
  const width = Math.ceil(photo.naturalWidth * scale);
  const height = Math.ceil(photo.naturalHeight * scale);
  const travel = Math.max(width - w, 0);
  const view = views[index];
  view.style.width = width + "px";
  view.style.height = height + "px";
  view.style.setProperty("--left", -travel * position + "px");
  view.style.setProperty("--top", -(height - h) / 2 + "px");
  if (index === selected) availableTravel = travel;
}

function resizeViews() {
  views.forEach((_, index) => {
    placeView(index, index === selected ? gaze : stops[index].position[Number(mobile.matches)]);
  });
}

function showNotice(message) {
  clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.hidden = false;
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 3800);
}

async function goTo(index, focusTitle = false) {
  const request = ++cut;
  if (index === selected) return;
  try {
    await panoramas[index].decode();
  } catch {
    if (request === cut) showNotice("这处场景暂时无法打开，请检查图片文件后再试。");
    return;
  }
  if (request !== cut) return;

  releaseDrag();
  selected = index;
  gaze = defaultGaze();
  placeView(index, gaze);
  const stop = stops[index];
  experience.dataset.scene = stop.id;
  views.forEach((view, i) => {
    const active = i === index;
    view.inert = !active;
    view.classList.toggle("current", active);
    view.toggleAttribute("aria-hidden", !active);
  });
  route.forEach((button, i) => {
    if (i === index) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
  era.textContent = stop.context;
  title.textContent = stop.title;
  description.textContent = stop.description;
  advance.querySelector("span").textContent = stop.action;
  advance.querySelector("use").setAttribute("href", index === stops.length - 1 ? "#back" : "#arrow");
  updateSound();
  if (focusTitle) title.focus({ preventScroll: true });
}

function moveGaze(position) {
  gaze = Math.max(0, Math.min(1, position));
  placeView(selected, gaze);
}

function releaseDrag() {
  if (!drag) return;
  const pointer = drag.id;
  drag = null;
  world.classList.remove("dragging");
  if (world.hasPointerCapture(pointer)) world.releasePointerCapture(pointer);
}

title.tabIndex = -1;
document.querySelectorAll("[data-go]").forEach(button => {
  button.addEventListener("click", () => goTo(Number(button.dataset.go), button.classList.contains("hotspot")));
});
advance.addEventListener("click", () => {
  if (selected === 0) window.location.href = "explore.html";
  else goTo((selected + 1) % stops.length);
});
panoramas.forEach(img => img.addEventListener("load", resizeViews));
new ResizeObserver(resizeViews).observe(world);
mobile.addEventListener("change", () => {
  gaze = defaultGaze();
  resizeViews();
});
resizeViews();

world.addEventListener("pointerdown", event => {
  if (!event.isPrimary || event.button !== 0 || event.target.closest("button") || availableTravel < 1) return;
  drag = { id: event.pointerId, start: event.clientX, gaze };
  world.setPointerCapture(event.pointerId);
  world.classList.add("dragging");
});
world.addEventListener("pointermove", event => {
  if (drag?.id !== event.pointerId || availableTravel < 1) return;
  moveGaze(drag.gaze - (event.clientX - drag.start) / availableTravel);
});
world.addEventListener("pointerup", releaseDrag);
world.addEventListener("pointercancel", releaseDrag);
world.addEventListener("lostpointercapture", releaseDrag);
window.addEventListener("keydown", event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    event.preventDefault();
    moveGaze(gaze + (event.key === "ArrowRight" ? 0.13 : -0.13));
  }
});

if (!document.fullscreenEnabled) fullscreen.hidden = true;
fullscreen.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await experience.requestFullscreen();
  } catch {
    showNotice("当前浏览窗口无法切换到全屏。");
  }
});
document.addEventListener("fullscreenchange", () => {
  const active = Boolean(document.fullscreenElement);
  fullscreen.setAttribute("aria-pressed", String(active));
  fullscreen.querySelector("use").setAttribute("href", active ? "#shrink" : "#full");
});

let sound;
let soundOn = false;
let changingSound = false;

function createSound() {
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  const context = new AudioEngine();
  const length = context.sampleRate * 8;
  const noise = context.createBuffer(1, length, context.sampleRate);
  const channel = noise.getChannelData(0);
  for (let i = 0; i < length; i++) channel[i] = Math.random() * 2 - 1;

  const source = context.createBufferSource();
  source.buffer = noise;
  source.loop = true;
  const windFilter = context.createBiquadFilter();
  windFilter.type = "lowpass";
  windFilter.frequency.value = 290;
  const waterFilter = context.createBiquadFilter();
  waterFilter.type = "bandpass";
  waterFilter.frequency.value = 720;
  waterFilter.Q.value = 0.75;

  const wind = context.createGain();
  wind.gain.value = 0.16;
  const water = context.createGain();
  water.gain.value = 0;
  const ripple = context.createGain();
  ripple.gain.value = 0.74;
  const wave = context.createOscillator();
  wave.frequency.value = 0.47;
  const intensity = context.createGain();
  intensity.gain.value = 0.25;
  const master = context.createGain();
  master.gain.value = 0;

  source.connect(windFilter).connect(wind).connect(master);
  source.connect(waterFilter).connect(water).connect(ripple).connect(master);
  wave.connect(intensity).connect(ripple.gain);
  master.connect(context.destination);
  source.start();
  wave.start();
  return { context, master, water };
}

function updateSound() {
  if (!sound) return;
  const now = sound.context.currentTime;
  sound.water.gain.setTargetAtTime(stops[selected].water, now, 0.3);
  sound.master.gain.setTargetAtTime(soundOn ? 0.64 : 0, now, 0.12);
}

audio.addEventListener("click", async () => {
  if (changingSound) return;
  changingSound = true;
  try {
    if (!soundOn) {
      sound ??= createSound();
      await sound.context.resume();
    }
    soundOn = !soundOn;
    audio.setAttribute("aria-pressed", String(soundOn));
    audio.querySelector("use").setAttribute("href", soundOn ? "#sound" : "#mute");
    updateSound();
  } catch {
    showNotice("当前浏览器无法播放环境声。");
  } finally {
    changingSound = false;
  }
});

function setLookMode(active) {
  experience.classList.toggle("unobstructed", active);
  const label = active ? "退出观景模式" : "观景模式";
  look.setAttribute("aria-pressed", String(active));
  look.setAttribute("aria-label", label);
  look.title = label;
  for (const element of experience.querySelectorAll(".scene-copy, .bottom, .wordmark, .hotspot")) {
    element.inert = active;
  }
}

look.addEventListener("click", () => setLookMode(look.getAttribute("aria-pressed") !== "true"));
window.addEventListener("keydown", event => {
  if (event.key === "Escape" && look.getAttribute("aria-pressed") === "true") setLookMode(false);
});

