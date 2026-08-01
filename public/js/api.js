// =============================================================================
// GIVEN TO YOU. DO NOT WRITE THIS FILE.
//
// Read it, understand it, and use it. Every page you build imports it.
// (queryCmds.js was handed to you the same way.)
// =============================================================================

// Import Modules
import { getToken, clearToken } from './auth.js';

// This file is everything axios would have given you, written by you, in about
// thirty lines. You will be able to explain every one of them in the interview.
//
// Two things about fetch bite everybody, and they are the reason this file exists:
//
//   1. fetch does NOT reject on 400 or 500. As far as the promise is concerned, a
//      404 is a SUCCESSFUL fetch: the server was asked, and it answered. fetch only
//      rejects when the request never made it (offline, DNS, connection refused).
//      So a bare try/catch around fetch will never once see your 400s. You have to
//      check res.ok and throw the error yourself. That is what axios does for you,
//      and it is why so much student error handling silently never runs.
//
//   2. The body arrives as a stream. res.json() reads it (once) and hands back a
//      promise. If the server sent HTML instead of JSON, which is exactly what a
//      crashed server or a typo'd route does, that parse throws. That is where
//      "Unexpected token '<'" comes from. So we look at the content type first.

// A real Error, so throw and catch behave normally, but carrying the status code
// and the server's own error string so the page can say something useful.
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const request = async (path, { method = 'GET', body } = {}) => {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';

  // Read the token fresh on every call. Reading it once when the module loads
  // means a logout in another tab leaves this page holding a token that is gone.
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    // The path IS the whole URL. Because Express serves this page and the API from
    // the same origin, a leading slash resolves to <this origin>/api/... from any
    // page, at any depth, in development and in production, with nothing to change.
    res = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // The only thing fetch rejects for: the request never left, or never landed.
    throw new ApiError(0, 'Cannot reach the server. Is it running?');
  }

  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const payload = isJson ? await res.json() : null;

  // A 401 usually means the token is missing, expired or forged, and there is no point
  // painting an error onto a page the user cannot use. Bin it and send them to log in.
  //
  // BUT NOT FROM AN AUTH ENDPOINT.
  //
  // A 401 from /api/auth/login means "wrong username or password", which is exactly what the
  // login page wants to SHOW you. Redirect on that and the page silently reloads, the message
  // you were about to read is wiped, and the user is left clicking a button that appears to do
  // nothing at all.
  //
  // Not every 401 means your session expired. Read the route, not just the number.
  const isAuthCall = path.startsWith('/api/auth/');
  if (res.status === 401 && !isAuthCall) {
    clearToken();
    window.location.href = '/login.html';
    throw new ApiError(401, 'Your session has expired. Please log in again.');
  }

  // res.ok is true for 200 to 299 and false for everything else. THIS is the line
  // fetch does not write for you.
  if (!res.ok) {
    // The server sends { error: '...' } on every failure. But a crashed server sends no JSON
    // at all, so payload can be null, and reading .error off null would throw a second error
    // on top of the first one. Check, then read.
    let message = `Request failed (${res.status})`;
    if (payload && payload.error) {
      message = payload.error;
    }

    throw new ApiError(res.status, message);
  }

  // Every success from this API is { message, data }. Unwrap the envelope once,
  // here, so that no page anywhere else ever has to think about it again.
  return payload;
};

export const get = (path) => request(path);
export const post = (path, body) => request(path, { method: 'POST', body });
export const put = (path, body) => request(path, { method: 'PUT', body });

// DELETE takes no body. Everything it needs is in the URL, because the address IS the thing
// you are deleting. If you find yourself sending a body with a DELETE, you have probably
// picked the wrong verb.
//
// `del`, not `delete`. `delete` is a reserved word in JavaScript.
export const del = (path) => request(path, { method: 'DELETE' });
