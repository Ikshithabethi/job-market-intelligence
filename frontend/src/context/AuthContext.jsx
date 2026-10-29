/**
 * Authentication state for the whole app.
 *
 * Holds the JWT + user object, restores them from localStorage on first load and
 * re-validates the token against GET /api/auth/me so an expired token does not
 * leave the UI in a half-logged-in state.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { authApi } from '../services/api';
import { clearSession, getStoredUser, getToken, setStoredUser, setToken } from '../services/session';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [token, setTokenState] = useState(() => getToken());
  const [initialising, setInitialising] = useState(Boolean(getToken()));

  useEffect(() => {
    const storedToken = getToken();
    if (!storedToken) {
      setInitialising(false);
      return undefined;
    }

    const controller = new AbortController();
    authApi
      .me(controller.signal)
      .then(({ data }) => {
        setUser(data.user);
        setStoredUser(data.user);
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        // Expired or invalid token: drop the session quietly.
        clearSession();
        setUser(null);
        setTokenState(null);
      })
      .finally(() => setInitialising(false));

    return () => controller.abort();
  }, []);

  const applySession = useCallback((payload) => {
    setToken(payload.token);
    setTokenState(payload.token);
    setUser(payload.user);
    setStoredUser(payload.user);
    return payload.user;
  }, []);

  const login = useCallback(
    async (email, password) => {
      const { data } = await authApi.login({ email, password });
      return applySession(data);
    },
    [applySession]
  );

  const register = useCallback(
    async (payload) => {
      const { data } = await authApi.register(payload);
      return applySession(data);
    },
    [applySession]
  );

  /**
   * The API is stateless, so "logout" is a best-effort call plus clearing the
   * local session. A failed call must never keep the user logged in locally.
   */
  const logout = useCallback(async () => {
    if (getToken()) {
      await authApi.logout().catch(() => undefined);
    }
    clearSession();
    setUser(null);
    setTokenState(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!getToken()) return null;
    try {
      const { data } = await authApi.me();
      setUser(data.user);
      setStoredUser(data.user);
      return data.user;
    } catch (error) {
      return null;
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      initialising,
      login,
      register,
      logout,
      refreshUser,
      setUser: (nextUser) => {
        setUser(nextUser);
        setStoredUser(nextUser);
      },
    }),
    [user, token, initialising, login, register, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
