// =============================================================================
// GIVEN TO YOU. DO NOT WRITE THIS FILE.
//
// Read it, understand it, and use it. Every page you build imports it.
// (queryCmds.js was handed to you the same way.)
// =============================================================================

const TOKEN_KEY = 'bedfish_token';

// Where to keep a token, honestly.
//
// localStorage survives a refresh and a browser restart, and any JavaScript on
// this page can read it. That means if an attacker ever gets a script onto your
// page (an XSS hole, which is exactly what innerHTML with server data gives them),
// they can read the token and become the user. The safer option in production is an
// httpOnly cookie, which the browser attaches automatically and JavaScript cannot
// read at all. We use localStorage here because it is simpler to see and to debug,
// and because it is what your CA2 brief asks for. Know the trade-off; say it out
// loud in the interview; do not pretend it does not exist.
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);
export const isLoggedIn = () => Boolean(getToken());

// Call this at the very top of any page that needs a logged-in user. It returns
// false and redirects, so the caller stops before it renders anything.
//
// This is a convenience, not a security control. The real gate is the authenticate
// middleware on the server, which the user cannot edit. Anything the browser checks,
// the user can turn off.
export const requireAuth = () => {
  if (!isLoggedIn()) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
};

export const logout = () => {
  clearToken();
  window.location.href = '/index.html';
};