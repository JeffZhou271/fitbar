import { armMusic, setAudioEnabled } from './music.js';

const canvas = document.querySelector('#previewCanvas');
const ctx = canvas.getContext('2d');
const soundButton = document.querySelector('#landingSoundBtn');
let t = 0, musicOn = true;

armMusic('menu');
soundButton.addEventListener('click', () => { musicOn = !musicOn; setAudioEnabled(musicOn); soundButton.textContent = musicOn ? '♪' : '×'; soundButton.classList.toggle('muted', !musicOn); });

function draw() {
  t += document.body.classList.contains('reduce-motion') ? 0 : .022;
  const { width, height } = canvas;
  const gradient = ctx.createLinearGradient(0, 0, width, height); gradient.addColorStop(0, '#111937'); gradient.addColorStop(.55, '#181044'); gradient.addColorStop(1, '#062039');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(130,160,255,.1)'; ctx.lineWidth = 1;
  for (let x = -60 + t * 30 % 60; x < width; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = 50; y < height; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  ctx.save(); ctx.shadowBlur = 22; ctx.shadowColor = '#ffd45f'; ctx.strokeStyle = '#ffd45f'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath();
  for (let x = 0; x <= width; x += 7) { const y = height * .53 + Math.sin(x * .014 + t) * 92 + Math.sin(x * .004 + t * .7) * 24; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); ctx.restore();
  const x = width * .3, targetY = height * .53 + Math.sin(x * .014 + t) * 92 + Math.sin(x * .004 + t * .7) * 24, y = targetY + Math.sin(t * 4) * 7;
  ctx.save(); ctx.shadowBlur = 28; ctx.shadowColor = '#55e8d2'; ctx.fillStyle = '#55e8d2'; ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#eaffff'; ctx.beginPath(); ctx.arc(x - 5, y - 5, 6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  requestAnimationFrame(draw);
}
draw();
