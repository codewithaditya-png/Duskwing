"use strict";

const byId = (id) => document.getElementById(id);
const canvas = byId("game");
const ctx = canvas.getContext("2d");
const overlay = byId("overlay");
const action = byId("action");
const pause = byId("pause");
const sound = byId("sound");

const HEIGHT = 480;
const FLOOR = 448;
const GATE_WIDTH = 54;
const SPACING = 250;
const HIT_RADIUS = 12;
const STORAGE_KEY = "duskwing.best";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let width = 960;
let scale = 1;
let landscape;
let state = "ready";
let score = 0;
let best = 0;
let startBest = 0;
let elapsed = 0;
let distance = 0;
let velocity = 0;
let y = 222;
let gates = [];
let muted = true;
let audio;

try {
  const saved = Number(localStorage.getItem(STORAGE_KEY));
  if (Number.isSafeInteger(saved) && saved > 0) best = saved;
} catch {
  // The game also runs when browser storage is unavailable.
}
byId("best").textContent = best;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const birdX = () => Math.min(185, width * .26);

function polygon(points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
  ctx.fill();
}

function circle(x, y, radius, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function buildLandscape() {
  const buffer = document.createElement("canvas");
  buffer.width = canvas.width;
  buffer.height = canvas.height;
  // Draw the static sky once per resize to keep the game loop lightweight.
  const sky = buffer.getContext("2d");
  sky.setTransform(scale, 0, 0, scale, 0, 0);
  const gradient = sky.createLinearGradient(0, 0, 0, FLOOR);
  gradient.addColorStop(0, "#221a47");
  gradient.addColorStop(.48, "#614074");
  gradient.addColorStop(.84, "#c6788c");
  gradient.addColorStop(1, "#f3ae96");
  sky.fillStyle = gradient;
  sky.fillRect(0, 0, width, HEIGHT);

  const moonX = width * .75;
  const glow = sky.createRadialGradient(moonX, 122, 25, moonX, 122, 113);
  glow.addColorStop(0, "#ffe4c36b");
  glow.addColorStop(1, "#ffbba500");
  sky.fillStyle = glow;
  sky.fillRect(moonX - 113, 9, 226, 226);
  sky.fillStyle = "#ffdfb9";
  sky.beginPath();
  sky.arc(moonX, 122, 43, 0, Math.PI * 2);
  sky.fill();

  for (let i = 0; i < Math.ceil(width / 11); i++) {
    const x = (i * 53.7 + 17) % width;
    const starY = 17 + (i * 31.3) % 240;
    if (Math.hypot(x - moonX, starY - 122) < 46) continue;
    sky.fillStyle = i % 6 ? "#ffe9d96f" : "#fff1d6bf";
    sky.fillRect(x, starY, i % 6 ? 1.3 : 2.5, i % 6 ? 1.3 : 2.5);
  }

  for (let i = 0; i < 11; i++) {
    sky.fillStyle = i % 2 ? "#fbd4c124" : "#edb4cd2e";
    sky.fillRect((i * 141.5 + 21) % width, 170 + (i * 31) % 205, 55 + i * 5, 2 + i % 4);
  }

  const ridges = [
    { base: 374, relief: 83, color: "#996284", step: 72 },
    { base: 409, relief: 69, color: "#65486f", step: 56 },
    { base: 451, relief: 64, color: "#392d56", step: 43 }
  ];
  for (const { base, relief, color, step } of ridges) {
    sky.beginPath();
    sky.moveTo(0, HEIGHT);
    for (let x = 0; x <= width + step; x += step) {
      const peak = .35 + .31 * Math.sin(x / 93 + step) + .29 * Math.cos(x / 29 + step);
      sky.lineTo(x, base - peak * relief);
    }
    sky.lineTo(width, HEIGHT);
    sky.fillStyle = color;
    sky.fill();
  }
  return buffer;
}

function resize() {
  const { width: pixelsWide, height: pixelsHigh } = canvas.getBoundingClientRect();
  if (!pixelsWide || !pixelsHigh) return;
  const previousX = birdX();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(pixelsWide * dpr);
  canvas.height = Math.round(pixelsHigh * dpr);
  scale = canvas.height / HEIGHT;
  width = canvas.width / scale;
  const shift = birdX() - previousX;
  for (const gate of gates) gate.x += shift;
  landscape = buildLandscape();
}
new ResizeObserver(resize).observe(canvas);
resize();

function drawGate({ x, center, gap }) {
  const top = center - gap / 2;
  const bottom = center + gap / 2;
  const right = x + GATE_WIDTH;

  polygon([[x, 0], [right, 0], [right, top - 14], [x + 31, top], [x, top - 12]], "#2b264f");
  polygon([[x, 0], [x + 16, 0], [x + 20, top - 11], [x, top - 12]], "#8776aa");
  polygon([[x + 16, 0], [right - 13, 0], [x + 31, top], [x + 20, top - 11]], "#51416f");
  polygon([[x, top - 12], [x + 20, top - 11], [x + 31, top]], "#e4b0d4");

  polygon([[x, bottom + 22], [x + 18, bottom], [right, bottom + 13], [right, FLOOR], [x, FLOOR]], "#332a53");
  polygon([[x, bottom + 22], [x + 18, bottom], [x + 23, bottom + 28], [x + 12, FLOOR], [x, FLOOR]], "#80689e");
  polygon([[x + 18, bottom], [right, bottom + 13], [x + 23, bottom + 28]], "#d79cbe");
  polygon([[x + 23, bottom + 28], [right, bottom + 13], [right - 10, FLOOR], [x + 12, FLOOR]], "#594578");

  ctx.fillStyle = "#f7c9df";
  ctx.fillRect(x + 8, top - 34, 2, 13);
  ctx.fillRect(x + 12, bottom + 23, 2, 16);
}

function drawBird(bob, time) {
  ctx.save();
  ctx.translate(birdX(), y + bob);
  ctx.rotate(state === "running" ? clamp(velocity / 850, -.34, .55) : -.08);
  ctx.shadowColor = "#ffc567";
  ctx.shadowBlur = 20;
  circle(0, 0, 9, "#ff994b");
  ctx.shadowBlur = 0;

  polygon([[-7, 5], [-32, 11], [-24, 2], [-31, -1], [-9, -4]], "#f08462");
  polygon([[-16, 1], [-8, -8], [2, -9], [8, -15], [18, -13], [21, -7], [15, 1], [5, 9], [-7, 10]], "#ffc36b");
  const wing = reducedMotion ? -5 : Math.sin(time * .017) * 8 - 5;
  polygon([[4, 1], [-12, wing - 13], [-20, wing - 10], [-10, 5], [-3, 8]], "#ff9a52");
  polygon([[19, -9], [28, -6], [18, -3]], "#f9df92");
  circle(15, -9, 2.4, "#33243c");
  ctx.restore();
}

function draw(time) {
  if (!landscape) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(landscape, 0, 0);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  for (let i = 0; i < 24; i++) {
    const x = ((width + i * 73.3 - distance * .11) % width + width) % width;
    const speckY = 245 + (i * 27.6) % 180;
    circle(x, speckY, i % 4 ? 1 : 1.7, "#ffdda87d");
  }

  if (state === "ready") {
    drawGate({ x: width * .76, center: 232, gap: 182 });
  }
  for (const gate of gates) drawGate(gate);

  ctx.fillStyle = "#1f1a37";
  ctx.fillRect(0, FLOOR, width, HEIGHT - FLOOR);
  ctx.fillStyle = "#b185a5";
  ctx.fillRect(0, FLOOR, width, 2);
  ctx.fillStyle = "#84688c";
  for (let x = -(distance % 26); x < width; x += 26) {
    ctx.fillRect(x, FLOOR + 8, 10, 1.5);
  }

  const bob = state === "ready" && !reducedMotion ? Math.sin(time / 300) * 8 : 0;
  drawBird(bob, time);
}

function tone(frequency, duration, type = "sine") {
  if (muted) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    audio ??= new Audio();
    if (audio.state === "suspended") audio.resume().catch(() => {});
    const now = audio.currentTime;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(.08, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  } catch {
    // Audio is optional.
  }
}

function showPanel(heading, message, button, label = "") {
  byId("game-heading").textContent = heading;
  byId("game-message").textContent = message;
  byId("status-label").textContent = label;
  byId("status-label").hidden = !label;
  action.firstChild.nodeValue = button + " ";
  overlay.hidden = false;
}

function flap() {
  velocity = -316;
  tone(370, .11, "triangle");
}

function addGate(x, center) {
  gates.push({ x, center, gap: Math.max(128, 174 - score * 2), passed: false });
}

function start() {
  elapsed = 0;
  distance = 0;
  y = 222;
  score = 0;
  startBest = best;
  gates = [];
  addGate(birdX() + 245, 224);
  byId("score").textContent = score;
  pause.disabled = false;
  pause.textContent = "Pause";
  state = "running";
  overlay.hidden = true;
  canvas.focus({ preventScroll: true });
  flap();
}

function end() {
  state = "over";
  const restoreFocus = [canvas, pause, document.body].includes(document.activeElement);
  pause.disabled = true;
  tone(135, .27, "triangle");
  const message = `Score ${score} · Best ${best}`;
  showPanel("Flight ended", message, "Fly again", score > startBest ? "NEW BEST" : "");
  byId("announcement").textContent = `Flight ended. Score ${score}. Best ${best}.`;
  if (restoreFocus) action.focus({ preventScroll: true });
}

function togglePause() {
  if (state === "running") {
    state = "paused";
    pause.textContent = "Resume";
    showPanel("Flight paused", "Resume when you’re ready.", "Resume flight");
  } else if (state === "paused") {
    state = "running";
    pause.textContent = "Pause";
    overlay.hidden = true;
    canvas.focus({ preventScroll: true });
  }
}

function input() {
  if (state === "running") flap();
  else if (state === "paused") togglePause();
  else start();
}

function update(dt) {
  elapsed += dt;
  const speed = Math.min(228, 164 + elapsed * 1.2);
  distance += speed * dt;
  velocity += 910 * dt;
  y += velocity * dt;

  if (y - HIT_RADIUS <= 0 || y + HIT_RADIUS >= FLOOR) {
    y = clamp(y, HIT_RADIUS, FLOOR - HIT_RADIUS);
    end();
    return;
  }

  const x = birdX();
  for (const gate of gates) {
    gate.x -= speed * dt;
    const right = gate.x + GATE_WIDTH;
    const overlaps = x + HIT_RADIUS > gate.x && x - HIT_RADIUS < right;
    const outsideGap = Math.abs(y - gate.center) + HIT_RADIUS > gate.gap / 2;
    if (overlaps && outsideGap) {
      end();
      return;
    }
    if (!gate.passed && right < x - HIT_RADIUS) {
      gate.passed = true;
      score++;
      byId("score").textContent = score;
      tone(710, .13);
      if (score > best) {
        best = score;
        byId("best").textContent = best;
        try {
          localStorage.setItem(STORAGE_KEY, String(best));
        } catch {
          // The current session keeps its high score.
        }
      }
    }
  }

  const last = gates[gates.length - 1];
  if (last.x + SPACING <= Math.max(width + 10, x + 245)) {
    const center = clamp(last.center + (Math.random() - .5) * 134, 132, 317);
    addGate(last.x + SPACING, center);
  }
  if (gates[0].x + GATE_WIDTH < 0) gates.shift();
}

action.addEventListener("click", input);
pause.addEventListener("click", togglePause);
canvas.addEventListener("pointerdown", (event) => {
  if (event.isPrimary && event.button === 0) input();
});
sound.addEventListener("click", () => {
  muted = !muted;
  sound.textContent = muted ? "Sound off" : "Sound on";
  sound.setAttribute("aria-pressed", String(!muted));
  tone(540, .12);
});

window.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.code === "Escape" || event.code === "KeyP") {
    if (!event.repeat) togglePause();
    return;
  }
  if (event.code !== "Space" && event.code !== "ArrowUp") return;
  if (event.code === "Space" && event.target instanceof HTMLButtonElement) return;
  event.preventDefault();
  if (!event.repeat) input();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "running") togglePause();
});

let previousTime;
function frame(time) {
  const dt = previousTime === undefined ? 0 : Math.min((time - previousTime) / 1000, .035);
  previousTime = time;
  if (state === "running") update(dt);
  draw(time);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
