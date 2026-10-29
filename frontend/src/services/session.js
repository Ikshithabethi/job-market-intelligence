/**
 * Token storage.
 *
 * The backend issues a stateless JWT, so the client only has to remember the
 * token and send it back in the Authorization header. localStorage is used so a
 * page refresh does not log the user out. This is fine for a local academic
 * project; a production app would prefer an httpOnly cookie.
 */
const TOKEN_KEY = 'jmi.token';
const USER_KEY = 'jmi.user';

export function getToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch (error) {
    return null;
  }
}

export function setToken(token) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch (error) {
    /* storage unavailable (private mode): the session simply will not persist */
  }
}

export function getStoredUser() {
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

export function setStoredUser(user) {
  try {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (error) {
    /* ignore */
  }
}

export function clearSession() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  } catch (error) {
    /* ignore */
  }
}
