import { get, post, put } from './api.js';
import { logout, requireAuth } from './auth.js';
import { armMusic, playSfx, setAudioEnabled, setMusicMode } from './music.js';

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
Object.assign(ui, {
  pause: $('#pauseBtn'), feedback: $('#feedbackPop'), countdown: $('#countdown'), calibration: $('#calibrationModal'),
  calFill: $('#calibrationFill'), calMarker: $('#calibrationMarker'), calLow: $('#calLow'), calCurrent: $('#calCurrent'), calHigh: $('#calHigh'),
  finishCalibration: $('#finishCalibration'), results: $('#resultsModal'), resultScore: $('#resultScore'), resultAccuracy: $('#resultAccuracy'),
  resultMoves: $('#resultMoves'), resultRank: $('#resultRank'), xpEarned: $('#xpEarned'), personalBest: $('#personalBest'),
  dashboard: $('#dashboardModal'), leaderboard: $('#leaderboardModal')
});

const games = {
  trail: { title: 'Skyline Surfer', hint: 'Match the glowing trail', icon: '〰', text: 'Move your FitBar up and down to stay on the energy trail.' },
  targets: { title: 'Power Pop', hint: 'Line up with targets to smash them', icon: '◎', text: 'Move fast, line up with each power orb, and smash it for points.' },
  dodge: { title: 'Neon Escape', hint: 'Stay inside every energy gate', icon: '◇', text: 'Control your height and slip through the gaps in the neon walls.' },
  rhythm: { title: 'Rhythm Lift', hint: 'Hit each note when it reaches the line', icon: '♫', text: 'Follow the beat: meet each note at the glowing strike line.' },
  boss: { title: 'Titan Clash', hint: 'Match attack zones to damage the Titan', icon: '♛', text: 'Charge powerful attacks with precise movement and defeat the Titan.' }
};

const roundLength = 45;
let game = 'trail', running = false, startTime = 0, lastFrame = 0, worldTime = 0;
let position = 50, targetPosition = 50, score = 0, samples = 0, successes = 0, reps = 0;
let lastDirection = null, lastSaved = null, objects = [], spawnTimer = 0, combo = 1, flash = 0, muted = false, paused = false;
let calibrationLow = 0, calibrationHigh = 100, bestScore = 0, bossHealth = 100, dashboardData = null, pauseStarted = 0;
let savedRange = JSON.parse(sessionStorage.getItem('fitbar_calibrated') || 'null');

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
  if (running && !paused) { samples++; if (error < 11) { successes++; score += (30 - error) * delta * combo; combo = clamp(combo + delta * .25, 1, 5); } else combo = 1; }
}

function spawnTarget() {
  objects.push({ x: canvas.width + 40, p: 12 + Math.random() * 76, hit: false });
}

function drawTargets(delta) {
  if (running && !paused && (spawnTimer -= delta) <= 0) { spawnTarget(); spawnTimer = .85 + Math.random() * .55; }
  const px = canvas.width * .22;
  objects.forEach((o) => {
    if (running && !paused) o.x -= delta * 310;
    const y = yFromPercent(o.p), near = Math.abs(o.x - px) < 28, aligned = Math.abs(position - o.p) < 13;
    if (!o.hit && near) { samples++; if (aligned) { o.hit = true; successes++; reps++; score += 180 * combo; combo = clamp(combo + 1, 1, 8); flash = .18; showFeedback('PERFECT!', true); ping(620); } else { combo = 1; showFeedback('MISS', false); } }
    ctx.save(); ctx.globalAlpha = o.hit ? .15 : 1; ctx.shadowBlur = 25; ctx.shadowColor = '#ff5ebc'; ctx.strokeStyle = '#ff63c3'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.arc(o.x, y, 25, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(o.x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  });
  objects = objects.filter((o) => o.x > -50);
}

function drawRhythm(delta) {
  const px = canvas.width * .22;
  ctx.fillStyle = 'rgba(85,232,210,.12)'; ctx.fillRect(px - 8, 0, 16, canvas.height);
  ctx.strokeStyle = '#55e8d2'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, canvas.height); ctx.stroke();
  if (running && !paused && (spawnTimer -= delta) <= 0) { objects.push({ x: canvas.width + 30, p: Math.random() > .5 ? 75 : 25, checked: false }); spawnTimer = .72; }
  objects.forEach((o) => {
    if (running && !paused) o.x -= delta * 360;
    const y = yFromPercent(o.p); ctx.save(); ctx.shadowBlur = 22; ctx.shadowColor = '#ffd45f'; ctx.fillStyle = '#ffd45f'; ctx.beginPath(); ctx.arc(o.x, y, 17, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    if (!o.checked && o.x < px + 12) { o.checked = true; samples++; const hit = Math.abs(position - o.p) < 17; if (hit) { successes++; reps++; score += 150 * combo; combo = clamp(combo + 1, 1, 10); showFeedback(combo > 4 ? 'ON FIRE!' : 'NICE!', true); ping(o.p > 50 ? 720 : 420); } else { combo = 1; showFeedback('MISS', false); } }
  });
  objects = objects.filter((o) => o.x > -40);
}

function drawBoss(delta) {
  if (running && !paused && (spawnTimer -= delta) <= 0) { objects.push({ x: canvas.width * .5, p: 15 + Math.random() * 70, life: 1.35, checked: false }); spawnTimer = 1.55; }
  ctx.fillStyle = 'rgba(255,255,255,.1)'; roundedRect(canvas.width * .54, 35, canvas.width * .38, 14, 7);
  ctx.fillStyle = '#ff597e'; roundedRect(canvas.width * .54, 35, canvas.width * .38 * bossHealth / 100, 14, 7);
  ctx.fillStyle = '#fff'; ctx.font = '800 18px system-ui'; ctx.fillText(`TITAN  ${Math.ceil(bossHealth)}%`, canvas.width * .54, 27);
  ctx.save(); ctx.translate(canvas.width * .77, canvas.height * .5); ctx.shadowBlur = 35; ctx.shadowColor = '#ff597e'; ctx.fillStyle = '#b53f69'; ctx.beginPath(); ctx.arc(0, 0, 76, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-35, -15, 18, 9); ctx.fillRect(17, -15, 18, 9); ctx.restore();
  objects.forEach((o) => {
    if (running && !paused) o.life -= delta; const y = yFromPercent(o.p); const radius = 35 + o.life * 22;
    ctx.strokeStyle = '#ffd45f'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(o.x, y, Math.max(30, radius), 0, Math.PI * 2); ctx.stroke();
    if (!o.checked && o.life <= 0) { o.checked = true; samples++; const hit = Math.abs(position - o.p) < 16; if (hit) { successes++; reps++; const damage = 8 + combo; bossHealth = Math.max(0, bossHealth - damage); score += 260 * combo; combo = clamp(combo + 1, 1, 8); showFeedback(`-${Math.round(damage)} HP`, true); flash = .15; ping(540); } else { combo = 1; showFeedback('BLOCKED', false); } }
  });
  objects = objects.filter((o) => o.life > -.35);
  if (bossHealth <= 0 && running) { score += 2500; finishRound(true); }
}

function spawnGate() {
  objects.push({ x: canvas.width + 50, p: 20 + Math.random() * 60, checked: false });
}

function drawDodge(delta) {
  if (running && !paused && (spawnTimer -= delta) <= 0) { spawnGate(); spawnTimer = 1.25; }
  const px = canvas.width * .22, gap = 145;
  objects.forEach((o) => {
    if (running && !paused) o.x -= delta * 280;
    const center = yFromPercent(o.p), topH = center - gap / 2, bottomY = center + gap / 2;
    ctx.save(); ctx.shadowBlur = 16; ctx.shadowColor = '#8f68ff'; ctx.fillStyle = '#7957ed';
    roundedRect(o.x - 20, 0, 40, topH, 10); roundedRect(o.x - 20, bottomY, 40, canvas.height - bottomY, 10); ctx.restore();
    if (!o.checked && o.x < px) { o.checked = true; samples++; if (Math.abs(position - o.p) < 16) { successes++; reps++; score += 220 * combo; combo = clamp(combo + 1, 1, 8); ping(480); } else { combo = 1; flash = .25; } }
  });
  if (running && !paused) score += delta * 12;
  objects = objects.filter((o) => o.x > -60);
}

function drawScene(delta = 0) {
  drawBackground();
  if (game === 'trail') drawTrail(delta); else if (game === 'targets') drawTargets(delta); else if (game === 'dodge') drawDodge(delta); else if (game === 'rhythm') drawRhythm(delta); else drawBoss(delta);
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
  if (running && !paused) {
    const left = roundLength - (now - startTime) / 1000;
    if (left <= 0) finishRound();
    updateMetrics(left);
  }
  drawScene(delta); requestAnimationFrame(frame);
}

function finishRound(bossDefeated = false) {
  running = false; ui.status.textContent = 'FINISHED'; ui.status.className = 'status-badge finished'; ui.save.disabled = false; lastSaved = null;
  ui.pause.disabled = true; const accuracy = samples ? successes / samples * 100 : 100; const rank = accuracy >= 95 ? 'S' : accuracy >= 85 ? 'A' : accuracy >= 70 ? 'B' : 'C';
  ui.resultScore.textContent = Math.round(score).toLocaleString(); ui.resultAccuracy.textContent = `${Math.round(accuracy)}%`; ui.resultMoves.textContent = reps; ui.resultRank.textContent = rank;
  $('#resultsTitle').textContent = bossDefeated ? 'Titan defeated!' : rank === 'S' ? 'Legendary run!' : 'Round complete!';
  ui.xpEarned.textContent = `+${Math.round(score / 10 + reps * 5 + 50)} XP`; ui.personalBest.classList.toggle('hidden', score <= bestScore); ui.results.classList.remove('hidden'); setMusicMode('menu'); ping(760);
}

async function resetRound() {
  if (!sessionStorage.getItem('fitbar_calibrated')) { openCalibration(); return; }
  ui.overlay.classList.add('hidden'); ui.results.classList.add('hidden');
  for (const value of ['3', '2', '1', 'GO!']) { ui.countdown.textContent = value; ui.countdown.classList.add('show'); ping(value === 'GO!' ? 700 : 340); await new Promise((resolve) => setTimeout(resolve, 650)); }
  ui.countdown.classList.remove('show'); running = true; paused = false; startTime = performance.now(); lastFrame = 0; score = 0; samples = 0; successes = 0; reps = 0; combo = 1; objects = []; spawnTimer = .4; bossHealth = 100;
  setMusicMode(game === 'boss' ? 'boss' : 'game');
  ui.save.disabled = true; $('#resultSaveBtn').disabled = false; ui.pause.disabled = false; ui.pause.textContent = 'Pause'; ui.status.textContent = 'LIVE'; ui.status.className = 'status-badge live'; updateMetrics();
}

function selectGame(name) {
  game = name; running = false; objects = []; score = 0; samples = 0; successes = 0; reps = 0; combo = 1;
  document.querySelectorAll('.game-card').forEach((card) => card.classList.toggle('active', card.dataset.game === name));
  const info = games[name]; ui.title.textContent = info.title; ui.hint.textContent = info.hint; ui.overlayTitle.textContent = info.title;
  ui.overlayText.textContent = info.text; ui.overlayIcon.textContent = info.icon; ui.overlayStart.innerHTML = '<span>▶</span> Play now';
  ui.overlay.classList.remove('hidden'); ui.status.textContent = 'READY'; ui.status.className = 'status-badge'; updateMetrics();
  setMusicMode('menu');
}

function showFeedback(message, good) {
  ui.feedback.textContent = message; ui.feedback.className = `feedback-pop show ${good ? 'good' : 'bad'}`;
  clearTimeout(showFeedback.timer); showFeedback.timer = setTimeout(() => ui.feedback.classList.remove('show'), 450);
}

function openCalibration() { calibrationLow = targetPosition; calibrationHigh = targetPosition; ui.calibration.classList.remove('hidden'); updateCalibration(); }
function updateCalibration() {
  calibrationLow = Math.min(calibrationLow, targetPosition); calibrationHigh = Math.max(calibrationHigh, targetPosition);
  ui.calLow.textContent = Math.round(calibrationLow); ui.calCurrent.textContent = Math.round(targetPosition); ui.calHigh.textContent = Math.round(calibrationHigh);
  ui.calFill.style.left = `${calibrationLow}%`; ui.calFill.style.width = `${calibrationHigh - calibrationLow}%`; ui.calMarker.style.left = `${targetPosition}%`;
  const ready = calibrationHigh - calibrationLow >= 45; ui.finishCalibration.disabled = !ready; ui.finishCalibration.textContent = ready ? 'Finish calibration' : 'Move through your full range';
}

function setInputPosition(raw) {
  const previous = targetPosition;
  const calibrating = !ui.calibration.classList.contains('hidden');
  targetPosition = savedRange && !calibrating && savedRange.high > savedRange.low
    ? clamp((raw - savedRange.low) / (savedRange.high - savedRange.low) * 100, 0, 100)
    : raw;
  countRep(previous, targetPosition);
  if (calibrating) updateCalibration();
}

function countRep(previous, current) {
  const direction = current > previous ? 'up' : current < previous ? 'down' : lastDirection;
  if (game === 'trail' && lastDirection === 'up' && direction === 'down' && current > 70) reps++;
  lastDirection = direction;
}

function ping(frequency) {
  if (muted) return;
  playSfx(frequency);
}

async function pollSensor() {
  try {
    const { data: sensor } = await get('/api/sensor/latest');
    const isFresh = sensor.updatedAt && Date.now() - new Date(sensor.updatedAt).getTime() < 5000;
    ui.source.textContent = sensor.source === 'esp32' && isFresh ? 'ESP32 LIVE' : 'DEMO';
    if (sensor.source === 'esp32' && isFresh) { ui.slider.value = Number(sensor.position); setInputPosition(Number(sensor.position)); }
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
      const rank = document.createElement('span'); rank.className = 'rank'; rank.textContent = index + 1;
      const copy = document.createElement('span'); const title = document.createElement('strong'); const detail = document.createElement('small');
      title.textContent = item.mode; detail.textContent = `${item.accuracy}% accuracy · ${item.reps} moves`; copy.append(title, detail);
      const points = document.createElement('b'); points.textContent = item.score.toLocaleString(); row.append(rank, copy, points);
      ui.scores.append(row);
    });
  } catch { ui.scores.innerHTML = '<p class="empty-scores">Scores unavailable.</p>'; }
}

async function loadDashboard() {
  try {
    const { data } = await get('/api/dashboard'); dashboardData = data; bestScore = data.stats.bestScore;
    const icons = { bolt: '⚡', rocket: '🚀', crown: '♛', robot: '🤖' };
    $('#profileAvatar').textContent = icons[data.profile.avatar]; $('#profileLevel').textContent = `Level ${data.stats.level}`;
    $('#xpBar').style.width = `${data.stats.xpIntoLevel / data.stats.xpForNextLevel * 100}%`; $('#xpCopy').textContent = `${data.stats.xpIntoLevel} / ${data.stats.xpForNextLevel} XP to next level`;
    const stats = [['Best score', data.stats.bestScore.toLocaleString()], ['Rounds', data.stats.rounds], ['Avg accuracy', `${data.stats.averageAccuracy}%`], ['Total moves', data.stats.totalMoves]];
    const box = $('#dashboardStats'); box.textContent = ''; stats.forEach(([label, value]) => { const item = document.createElement('div'); const strong = document.createElement('strong'); const span = document.createElement('span'); strong.textContent = value; span.textContent = label; item.append(strong, span); box.append(item); });
    $('#dailyTitle').textContent = data.dailyChallenge.title; $('#dailyDescription').textContent = data.dailyChallenge.description; $('#dailyProgress').textContent = `${data.dailyChallenge.progress} / ${data.dailyChallenge.target}`;
    const achievements = $('#achievements'); achievements.textContent = ''; data.achievements.forEach((entry) => { const item = document.createElement('div'); item.className = `achievement ${entry.unlocked ? 'unlocked' : ''}`; const icon = document.createElement('span'); const copy = document.createElement('div'); const title = document.createElement('strong'); const desc = document.createElement('small'); icon.textContent = entry.unlocked ? entry.icon : '🔒'; title.textContent = entry.name; desc.textContent = entry.description; copy.append(title, desc); item.append(icon, copy); achievements.append(item); });
    $('#reducedMotion').checked = data.profile.reducedMotion; $('#avatarSelect').value = data.profile.avatar; muted = !data.profile.sound; setAudioEnabled(!muted); ui.sound.textContent = muted ? '×' : '♪'; document.body.classList.toggle('reduce-motion', data.profile.reducedMotion);
  } catch {}
}

async function saveProfile() {
  const profile = { avatar: $('#avatarSelect').value, reducedMotion: $('#reducedMotion').checked, sound: !muted };
  await putProfile(profile); document.body.classList.toggle('reduce-motion', profile.reducedMotion); await loadDashboard();
}

async function putProfile(profile) {
  await put('/api/profile', profile);
}

async function loadLeaderboard() {
  const list = $('#leaderboardList'); list.textContent = '';
  try { const { data } = await get('/api/leaderboard'); data.forEach((entry) => { const row = document.createElement('div'); const rank = document.createElement('b'); const name = document.createElement('span'); const scoreText = document.createElement('strong'); rank.textContent = entry.rank <= 3 ? ['🥇','🥈','🥉'][entry.rank - 1] : `#${entry.rank}`; name.textContent = entry.username; scoreText.textContent = `${entry.score.toLocaleString()} pts`; row.append(rank, name, scoreText); list.append(row); }); if (!data.length) list.textContent = 'No scores yet.'; } catch { list.textContent = 'Leaderboard unavailable.'; }
}

async function saveResult() {
  if (lastSaved) return; const accuracy = samples ? successes / samples * 100 : 100;
  lastSaved = await post('/api/scores', { mode: `${games[game].title} · ${ui.mode.value}`, score, accuracy, reps }); ui.save.disabled = true; $('#resultSaveBtn').disabled = true; bestScore = Math.max(bestScore, score); await Promise.all([loadScores(), loadDashboard()]); showFeedback('SAVED!', true);
}

ui.slider.addEventListener('input', () => { ui.source.textContent = 'DEMO'; setInputPosition(Number(ui.slider.value)); });
ui.start.addEventListener('click', resetRound); ui.overlayStart.addEventListener('click', resetRound); ui.logout.addEventListener('click', logout);
ui.sound.addEventListener('click', () => { muted = !muted; setAudioEnabled(!muted); ui.sound.textContent = muted ? '×' : '♪'; ui.sound.classList.toggle('muted', muted); if (dashboardData) saveProfile(); });
ui.pause.addEventListener('click', () => { if (!running) return; paused = !paused; if (paused) { pauseStarted = performance.now(); ui.status.textContent = 'PAUSED'; ui.pause.textContent = 'Resume'; } else { startTime += performance.now() - pauseStarted; lastFrame = performance.now(); ui.status.textContent = 'LIVE'; ui.pause.textContent = 'Pause'; } });
document.querySelectorAll('.game-card').forEach((card) => card.addEventListener('click', () => selectGame(card.dataset.game)));
ui.save.addEventListener('click', saveResult); $('#resultSaveBtn').addEventListener('click', saveResult); $('#playAgainBtn').addEventListener('click', resetRound);
$('#dashboardBtn').addEventListener('click', async () => { await loadDashboard(); ui.dashboard.classList.remove('hidden'); });
$('#leaderboardBtn').addEventListener('click', async () => { await loadLeaderboard(); ui.leaderboard.classList.remove('hidden'); });
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => $(`#${button.dataset.close}`).classList.add('hidden')));
$('#finishCalibration').addEventListener('click', () => { savedRange = { low: calibrationLow, high: calibrationHigh }; sessionStorage.setItem('fitbar_calibrated', JSON.stringify(savedRange)); ui.calibration.classList.add('hidden'); resetRound(); });
$('#skipCalibration').addEventListener('click', () => { savedRange = { low: 0, high: 100 }; sessionStorage.setItem('fitbar_calibrated', JSON.stringify(savedRange)); ui.calibration.classList.add('hidden'); resetRound(); });
$('#reducedMotion').addEventListener('change', saveProfile); $('#avatarSelect').addEventListener('change', saveProfile);
document.addEventListener('keydown', (event) => { if (event.code === 'Space' && running) { event.preventDefault(); ui.pause.click(); } if (event.key === 'Escape') document.querySelectorAll('.arcade-modal').forEach((modal) => modal.classList.add('hidden')); });

armMusic('menu'); loadUser(); loadScores(); loadDashboard(); pollSensor(); selectGame('trail'); requestAnimationFrame(frame);
