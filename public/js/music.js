const AudioContextClass = window.AudioContext || window.webkitAudioContext;
let audioContext = null;
let master = null;
let musicGain = null;
let timer = null;
let step = 0;
let enabled = true;
let mode = 'menu';

const scales = {
  menu: [261.63, 329.63, 392, 523.25, 392, 329.63, 293.66, 392],
  game: [329.63, 392, 493.88, 659.25, 493.88, 587.33, 392, 493.88],
  boss: [164.81, 196, 207.65, 246.94, 164.81, 261.63, 207.65, 196],
};

function ensureAudio() {
  if (!AudioContextClass) return false;
  if (!audioContext) {
    audioContext = new AudioContextClass();
    master = audioContext.createGain();
    musicGain = audioContext.createGain();
    master.gain.value = .5;
    musicGain.gain.value = .11;
    musicGain.connect(master).connect(audioContext.destination);
  }
  if (audioContext.state === 'suspended') audioContext.resume();
  return true;
}

function note(frequency, when, duration, type = 'square', volume = .12) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, when);
  gain.gain.setValueAtTime(.001, when);
  gain.gain.exponentialRampToValueAtTime(volume, when + .012);
  gain.gain.exponentialRampToValueAtTime(.001, when + duration);
  oscillator.connect(gain).connect(musicGain);
  oscillator.start(when); oscillator.stop(when + duration + .02);
}

function kick(when) {
  const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain();
  oscillator.frequency.setValueAtTime(125, when); oscillator.frequency.exponentialRampToValueAtTime(45, when + .11);
  gain.gain.setValueAtTime(.18, when); gain.gain.exponentialRampToValueAtTime(.001, when + .13);
  oscillator.connect(gain).connect(musicGain); oscillator.start(when); oscillator.stop(when + .14);
}

function scheduleBeat() {
  if (!enabled || !audioContext) return;
  const now = audioContext.currentTime + .02;
  const melody = scales[mode] || scales.game;
  note(melody[step % melody.length], now, .13, step % 4 === 0 ? 'sawtooth' : 'square', .07);
  if (step % 2 === 0) kick(now);
  if (step % 4 === 2) note(melody[(step + 3) % melody.length] / 2, now, .22, 'triangle', .08);
  step++;
}

export function startMusic(nextMode = mode) {
  mode = nextMode;
  if (!enabled || !ensureAudio()) return;
  if (timer) clearInterval(timer);
  step = 0; scheduleBeat();
  const interval = mode === 'menu' ? 230 : mode === 'boss' ? 170 : 190;
  timer = setInterval(scheduleBeat, interval);
}

export function setMusicMode(nextMode) {
  if (mode === nextMode && timer) return;
  mode = nextMode;
  if (!audioContext) return;
  startMusic(nextMode);
}

export function setAudioEnabled(value) {
  enabled = value;
  if (!enabled) { if (timer) clearInterval(timer); timer = null; if (master) master.gain.setTargetAtTime(.001, audioContext.currentTime, .03); }
  else if (audioContext) { ensureAudio(); master.gain.setTargetAtTime(.5, audioContext.currentTime, .03); startMusic(mode); }
}

export function playSfx(frequency = 600, duration = .12) {
  if (!enabled || !ensureAudio()) return;
  const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain(); const now = audioContext.currentTime;
  oscillator.type = 'sine'; oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(.06, now); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
  oscillator.connect(gain).connect(master); oscillator.start(now); oscillator.stop(now + duration);
}

export function armMusic(modeName = 'menu') {
  const begin = () => { startMusic(modeName); document.removeEventListener('pointerdown', begin); document.removeEventListener('keydown', begin); };
  document.addEventListener('pointerdown', begin, { once: true });
  document.addEventListener('keydown', begin, { once: true });
}
