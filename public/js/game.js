import { get, post } from './api.js';
import { logout, requireAuth } from './auth.js';

if (!requireAuth()) {
  throw new Error('Login required');
}

const canvas = document.querySelector('#gameCanvas');
const ctx = canvas.getContext('2d');
const startBtn = document.querySelector('#startBtn');
const saveBtn = document.querySelector('#saveBtn');
const logoutBtn = document.querySelector('#logoutBtn');
const modeSelect = document.querySelector('#modeSelect');
const manualPosition = document.querySelector('#manualPosition');
const playerName = document.querySelector('#playerName');
const statusBadge = document.querySelector('#statusBadge');
const scoreValue = document.querySelector('#scoreValue');
const accuracyValue = document.querySelector('#accuracyValue');
const repValue = document.querySelector('#repValue');
const timeValue = document.querySelector('#timeValue');
const sourceValue = document.querySelector('#sourceValue');
const scoreList = document.querySelector('#scoreList');

const roundLength = 45;
let running = false;
let startTime = 0;
let lastFrame = 0;
let trackOffset = 0;
let position = 50;
let targetPosition = 50;
let score = 0;
let samples = 0;
let totalError = 0;
let reps = 0;
let lastDirection = null;
let lastSaved = null;

function targetAt(x) {
  const speed = modeSelect.value === 'Deadlift' ? 0.011 : 0.014;
  const wave = Math.sin(x * speed + trackOffset) * 0.5 + 0.5;
  return 18 + wave * 64;
}

function yFromPercent(percent) {
  return canvas.height - 70 - (percent / 100) * (canvas.height - 140);
}

function drawTrack() {
  ctx.strokeStyle = '#f2b84b';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();

  for (let x = 0; x <= canvas.width; x += 8) {
    const y = yFromPercent(targetAt(x));
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.stroke();
}

function drawPlayer() {
  const playerX = canvas.width * 0.28;
  const playerY = yFromPercent(position);
  const targetY = yFromPercent(targetAt(playerX));
  const error = Math.abs(playerY - targetY);
  const good = error < 45;

  ctx.strokeStyle = good ? 'rgba(24, 138, 79, 0.55)' : 'rgba(231, 111, 81, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(playerX, targetY);
  ctx.lineTo(playerX, playerY);
  ctx.stroke();

  ctx.fillStyle = good ? '#31c46f' : '#e76f51';
  ctx.beginPath();
  ctx.arc(playerX, playerY, 17, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(playerX - 5, playerY - 5, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawScene() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#10231b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let y = 70; y <= canvas.height - 70; y += 70) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  drawTrack();
  drawPlayer();
}

function updateMetrics(secondsLeft) {
  const accuracy = samples ? Math.max(0, 100 - totalError / samples) : 100;
  scoreValue.textContent = Math.round(score);
  accuracyValue.textContent = `${Math.round(accuracy)}%`;
  repValue.textContent = reps;
  timeValue.textContent = Math.max(0, Math.ceil(secondsLeft));
}

function countRep(previous, current) {
  const direction = current > previous ? 'up' : current < previous ? 'down' : lastDirection;
  if (lastDirection === 'up' && direction === 'down' && current > 70) reps += 1;
  lastDirection = direction;
}

function frame(now) {
  if (!lastFrame) lastFrame = now;
  const delta = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  position += (targetPosition - position) * Math.min(1, delta * 12);

  if (running) {
    const elapsed = (now - startTime) / 1000;
    const left = roundLength - elapsed;
    const playerX = canvas.width * 0.28;
    const target = targetAt(playerX);
    const error = Math.abs(position - target);
    trackOffset += delta * 2.1;
    samples += 1;
    totalError += error;
    score += Math.max(0, 120 - error * 2) * delta;

    updateMetrics(left);

    if (left <= 0) {
      running = false;
      statusBadge.textContent = 'Finished';
      statusBadge.className = 'badge text-bg-dark';
      saveBtn.disabled = false;
      lastSaved = null;
    }
  }

  drawScene();
  requestAnimationFrame(frame);
}

async function pollSensor() {
  try {
    const payload = await get('/api/sensor/latest');
    const sensor = payload.data;
    sourceValue.textContent = sensor.source === 'esp32' ? 'ESP32' : 'Demo';

    if (sensor.source === 'esp32' && sensor.updatedAt) {
      const previous = targetPosition;
      targetPosition = Number(sensor.position);
      manualPosition.value = targetPosition;
      countRep(previous, targetPosition);
    }
  } catch {
    sourceValue.textContent = 'Offline';
  } finally {
    setTimeout(pollSensor, 250);
  }
}

async function loadUser() {
  const payload = await get('/api/me');
  playerName.textContent = payload.data.user.username;
}

async function loadScores() {
  const payload = await get('/api/scores');
  scoreList.textContent = '';

  if (!payload.data.length) {
    const empty = document.createElement('p');
    empty.className = 'text-secondary small mb-0';
    empty.textContent = 'No saved rounds yet.';
    scoreList.append(empty);
    return;
  }

  payload.data.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'score-item';

    const title = document.createElement('strong');
    title.textContent = `${item.score} pts`;

    const detail = document.createElement('span');
    detail.textContent = `${item.mode} | ${item.accuracy}% | ${item.reps} reps`;

    row.append(title, detail);
    scoreList.append(row);
  });
}

function resetRound() {
  running = true;
  startTime = performance.now();
  lastFrame = 0;
  trackOffset = 0;
  score = 0;
  samples = 0;
  totalError = 0;
  reps = 0;
  lastDirection = null;
  saveBtn.disabled = true;
  statusBadge.textContent = 'Playing';
  statusBadge.className = 'badge text-bg-success';
}

manualPosition.addEventListener('input', () => {
  const previous = targetPosition;
  targetPosition = Number(manualPosition.value);
  sourceValue.textContent = 'Demo';
  countRep(previous, targetPosition);
});

startBtn.addEventListener('click', resetRound);
logoutBtn.addEventListener('click', logout);

saveBtn.addEventListener('click', async () => {
  if (lastSaved) return;

  const accuracy = samples ? Math.max(0, 100 - totalError / samples) : 100;
  lastSaved = await post('/api/scores', {
    mode: modeSelect.value,
    score,
    accuracy,
    reps,
  });

  saveBtn.disabled = true;
  await loadScores();
});

loadUser();
loadScores();
pollSensor();
requestAnimationFrame(frame);
