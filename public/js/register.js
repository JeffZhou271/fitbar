import { post } from './api.js';
import { setToken } from './auth.js';

const form = document.querySelector('#registerForm');
const message = document.querySelector('#message');

function showMessage(text, kind = 'danger') {
  message.textContent = text;
  message.className = `alert alert-${kind}`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    const payload = await post('/api/auth/register', {
      username: form.username.value,
      password: form.password.value,
    });

    setToken(payload.data.token);
    window.location.href = '/game.html';
  } catch (error) {
    showMessage(error.message);
  }
});
