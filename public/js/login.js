import { post } from './api.js';
import { setToken } from './auth.js';
import { armMusic, setAudioEnabled } from './music.js';

const form = document.querySelector('#loginForm');
const message = document.querySelector('#message');
let musicOn = true;
armMusic('menu');
document.querySelector('#authSoundBtn').addEventListener('click', (event) => { musicOn = !musicOn; setAudioEnabled(musicOn); event.currentTarget.textContent = musicOn ? '♪ Music' : '× Muted'; });
document.querySelector('.password-toggle').addEventListener('click', (event) => { const input = form.password; input.type = input.type === 'password' ? 'text' : 'password'; event.currentTarget.textContent = input.type === 'password' ? 'SHOW' : 'HIDE'; });

function showMessage(text, kind = 'danger') {
  message.textContent = text;
  message.className = `alert alert-${kind}`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    form.classList.add('loading');
    const payload = await post('/api/auth/login', {
      username: form.username.value,
      password: form.password.value,
    });

    setToken(payload.data.token);
    window.location.href = '/game.html';
  } catch (error) {
    showMessage(error.message);
    form.classList.remove('loading');
  }
});
