import { get, post } from './api.js';
import { logout, requireAuth } from './auth.js';

if (!requireAuth()) throw new Error('Login required');

const $ = (selector) => document.querySelector(selector);
const canvas = $('#gameCanvas');
const ctx = canvas.getContext('2d');
const ui = {
  start: $('#startBtn'), overlayStart: $('#overlayStartBtn'), save: $('#saveBtn'), logout: $('#logoutBtn'),
  mode: $('#modeSelect'), slider: $('#manualPosition'), player: $('#playerName'), status: $('#statusBadge'),
  score: $('#scoreValue'), accuracy: $('#accuracyValue'), reps: $('#repValue'), time: $('#timeValue'),
  source: $('#sourceValue'), scores: $('#scoreList'), overlay: $('#startOverlay'), combo: $('#comboPill'),
  comboValue: $('#comboValue'), title: $('#gameTitle'), hint: $('#gameHint'), overlayTitle: $('#overlayTitle'),
  overlayText: $('#overlayText'), overlayIcon: $('#overlayIcon'), accuracyBar: $('#accuracyBar'), sound: $('#soundBtn')
};

const games = {
  trail: { title: 'Skyline Surfer', hint: 'Match the glowing trail', icon: '〰', text: 'Move your FitBar up and down to stay on the energy trail.' },
  targets: { title: 'Power Pop', hint: 'Line up with targets to smash them', icon: '◎', text: 'Move fast, line up with each power orb, and smash it for points.' },
  dodge: { title: 'Neon Escape', hint: 'Stay inside every energy gate', icon: '◇', text: 'Control your height and slip through the gaps in the neon walls.' }
};

const roundLength = 45;
let game = 'trail', running = false, startTime = 0, lastFrame = 0, worldTime = 0;
let position = 50, targetPosition = 50, score = 0, samples = 0, successes = 0, reps = 0;
let lastDirection = null, lastSaved = null, objects = [], spawnTimer = 0, combo = 1, flash = 0, muted = false;

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const yFromPercent = (percent) => canvas.height - 70 - (percent / 100) * (canvas.height - 140);
const trailAt = (x) => 50 + Math.sin(x * 0.011 + worldTime * 2.15) * 28 + Math.sin(x * 0.004 + worldTime) * 8;

function roundedRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#111836'); gradient.addColorStop(0.55, '#151044'); gradient.addColorStop(1, '#071e35');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(120,155,255,.08)'; ctx.lineWidth = 1;
  const shift = (worldTime * 35) % 70;
  for (let x = -70 + shift; x < canvas.width; x += 70) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
  for (let y = 60; y < canvas.height; y += 70) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
  for (let i = 0; i < 28; i++) {
    const x = (i * 193 + worldTime * (10 + i % 4)) % canvas.width;
    const y = (i * 83) % canvas.height;
    ctx.fillStyle = `rgba(130,180,255,${0.12 + (i % 3) * .06})`; ctx.fillRect(x, y, 2, 2);
  }
}

function drawPlayer() {
  const x = canvas.width * .22, y = yFromPercent(position);
  ctx.save(); ctx.shadowBlur = 28; ctx.shadowColor = '#65f5dc';
  ctx.fillStyle = '#51e6d1'; ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = '#eaffff'; ctx.beginPath(); ctx.arc(x - 6, y - 6, 7, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(101,245,220,.25)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 29 + Math.sin(worldTime * 5) * 3, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}

function drawTrail(delta) {
  ctx.save(); ctx.shadowBlur = 20; ctx.shadowColor = '#ffcb55'; ctx.strokeStyle = '#ffd45f'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath();
  for (let x = 0; x <= canvas.width; x += 7) { const y = yFromPercent(trailAt(x)); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke(); ctx.shadowBlur = 0; ctx.strokeStyle = '#fff3b8'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  const error = Math.abs(position - trailAt(canvas.width * .22));
  if (running) { samples++; if (error < 11) { successes++; score += (30 - error) * delta * combo; combo = clamp(combo + delta * .25, 1, 5); } else combo = 1; }
}

function spawnTarget() {
  objects.push({ x: canvas.width + 40, p: 12 + Math.random() * 76, hit: false });
}

function drawTargets(delta) {
  if (running && (spawnTimer -= delta) <= 0) { spawnTarget(); spawnTimer = .85 + Math.random() * .55; }
  const px = canvas.width * .22;
  objects.forEach((o) => {
    if (running) o.x -= delta * 310;
    const y = yFromPercent(o.p), near = Math.abs(o.x - px) < 28, aligned = Math.abs(position - o.p) < 13;
    if (!o.hit && near) { samples++; if (aligned) { o.hit = true; successes++; reps++; score += 180 * combo; combo = clamp(combo + 1, 1, 8); flash = .18; ping(620); } else combo = 1; }
    ctx.save(); ctx.globalAlpha = o.hit ? .15 : 1; ctx.shadowBlur = 25; ctx.shadowColor = '#ff5ebc'; ctx.strokeStyle = '#ff63c3'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.arc(o.x, y, 25, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(o.x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  });
  objects = objects.filter((o) => o.x > -50);
}

function spawnGate() {
  objects.push({ x: canvas.width + 50, p: 20 + Math.random() * 60, checked: false });
}

function drawDodge(delta) {
  if (running && (spawnTimer -= delta) <= 0) { spawnGate(); spawnTimer = 1.25; }
  const px = canvas.width * .22, gap = 145;
  objects.forEach((o) => {
    if (running) o.x -= delta * 280;
    const center = yFromPercent(o.p), topH = center - gap / 2, bottomY = center + gap / 2;
    ctx.save(); ctx.shadowBlur = 16; ctx.shadowColor = '#8f68ff'; ctx.fillStyle = '#7957ed';
    roundedRect(o.x - 20, 0, 40, topH, 10); roundedRect(o.x - 20, bottomY, 40, canvas.height - bottomY, 10); ctx.restore();
    if (!o.checked && o.x < px) { o.checked = true; samples++; if (Math.abs(position - o.p) < 16) { successes++; reps++; score += 220 * combo; combo = clamp(combo + 1, 1, 8); ping(480); } else { combo = 1; flash = .25; } }
  });
  if (running) score += delta * 12;
  objects = objects.filter((o) => o.x > -60);
}

function drawScene(delta = 0) {
  drawBackground();
  if (game === 'trail') drawTrail(delta); else if (game === 'targets') drawTargets(delta); else drawDodge(delta);
  drawPlayer();
  if (flash > 0) { flash -= delta; ctx.fillStyle = game === 'targets' ? 'rgba(255,255,255,.16)' : 'rgba(255,70,120,.16)'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
}

function updateMetrics(left = roundLength) {
  const accuracy = samples ? successes / samples * 100 : 100;
  ui.score.textContent = Math.round(score).toLocaleString(); ui.accuracy.textContent = `${Math.round(accuracy)}%`;
  ui.accuracyBar.style.width = `${accuracy}%`; ui.reps.textContent = reps; ui.time.textContent = Math.max(0, Math.ceil(left));
  ui.comboValue.textContent = Math.floor(combo); ui.combo.classList.toggle('show', running && combo >= 2);
}

function frame(now) {
  if (!lastFrame) lastFrame = now;
  const delta = Math.min(.035, (now - lastFrame) / 1000); lastFrame = now;
  position += (targetPosition - position) * Math.min(1, delta * 13); worldTime += running ? delta : delta * .18;
  if (running) {
    const left = roundLength - (now - startTime) / 1000;
    if (left <= 0) finishRound();
    updateMetrics(left);
  }
  drawScene(delta); requestAnimationFrame(frame);
}

function finishRound() {
  running = false; ui.status.textContent = 'FINISHED'; ui.status.className = 'status-badge finished'; ui.save.disabled = false; lastSaved = null;
  ui.overlayTitle.textContent = 'Round complete!'; ui.overlayText.textContent = `${Math.round(score).toLocaleString()} points · ${ui.accuracy.textContent} accuracy`;
  ui.overlayStart.textContent = 'Play again'; ui.overlay.classList.remove('hidden'); ping(760);
}

function resetRound() {
  running = true; startTime = performance.now(); lastFrame = 0; score = 0; samples = 0; successes = 0; reps = 0; combo = 1; objects = []; spawnTimer = .4;
  ui.save.disabled = true; ui.status.textContent = 'LIVE'; ui.status.className = 'status-badge live'; ui.overlay.classList.add('hidden'); updateMetrics();
}

function selectGame(name) {
  game = name; running = false; objects = []; score = 0; samples = 0; successes = 0; reps = 0; combo = 1;
  document.querySelectorAll('.game-card').forEach((card) => card.classList.toggle('active', card.dataset.game === name));
  const info = games[name]; ui.title.textContent = info.title; ui.hint.textContent = info.hint; ui.overlayTitle.textContent = info.title;
  ui.overlayText.textContent = info.text; ui.overlayIcon.textContent = info.icon; ui.overlayStart.innerHTML = '<span>▶</span> Play now';
  ui.overlay.classList.remove('hidden'); ui.status.textContent = 'READY'; ui.status.className = 'status-badge'; updateMetrics();
}

function countRep(previous, current) {
  const direction = current > previous ? 'up' : current < previous ? 'down' : lastDirection;
  if (game === 'trail' && lastDirection === 'up' && direction === 'down' && current > 70) reps++;
  lastDirection = direction;
}

function ping(frequency) {
  if (muted) return;
  try { const ac = new AudioContext(); const osc = ac.createOscillator(); const gain = ac.createGain(); osc.frequency.value = frequency; gain.gain.setValueAtTime(.035, ac.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ac.currentTime + .12); osc.connect(gain).connect(ac.destination); osc.start(); osc.stop(ac.currentTime + .12); } catch {}
}

async function pollSensor() {
  try {
    const { data: sensor } = await get('/api/sensor/latest');
    const isFresh = sensor.updatedAt && Date.now() - new Date(sensor.updatedAt).getTime() < 5000;
    ui.source.textContent = sensor.source === 'esp32' && isFresh ? 'ESP32 LIVE' : 'DEMO';
    if (sensor.source === 'esp32' && isFresh) { const previous = targetPosition; targetPosition = Number(sensor.position); ui.slider.value = targetPosition; countRep(previous, targetPosition); }
  } catch { ui.source.textContent = 'OFFLINE'; }
  finally { setTimeout(pollSensor, 250); }
}

async function loadUser() { try { const payload = await get('/api/me'); ui.player.textContent = payload.data.user.username; } catch {} }
async function loadScores() {
  try {
    const payload = await get('/api/scores'); ui.scores.textContent = '';
    if (!payload.data.length) { ui.scores.innerHTML = '<p class="empty-scores">Finish a round to set your first high score.</p>'; return; }
    payload.data.slice(0, 4).forEach((item, index) => {
      const row = document.createElement('div'); row.className = 'score-item';
      row.innerHTML = `<span class="rank">${index + 1}</span><span><strong>${item.mode}</strong><small>${item.accuracy}% accuracy · ${item.reps} moves</small></span><b>${item.score.toLocaleString()}</b>`;
      ui.scores.append(row);
    });
  } catch { ui.scores.innerHTML = '<p class="empty-scores">Scores unavailable.</p>'; }
}

ui.slider.addEventListener('input', () => { const previous = targetPosition; targetPosition = Number(ui.slider.value); ui.source.textContent = 'DEMO'; countRep(previous, targetPosition); });
ui.start.addEventListener('click', resetRound); ui.overlayStart.addEventListener('click', resetRound); ui.logout.addEventListener('click', logout);
ui.sound.addEventListener('click', () => { muted = !muted; ui.sound.textContent = muted ? '×' : '♪'; ui.sound.classList.toggle('muted', muted); });
document.querySelectorAll('.game-card').forEach((card) => card.addEventListener('click', () => selectGame(card.dataset.game)));
ui.save.addEventListener('click', async () => {
  if (lastSaved) return; const accuracy = samples ? successes / samples * 100 : 100;
  lastSaved = await post('/api/scores', { mode: `${games[game].title} · ${ui.mode.value}`, score, accuracy, reps }); ui.save.disabled = true; await loadScores();
});

loadUser(); loadScores(); pollSensor(); selectGame('trail'); requestAnimationFrame(frame);
