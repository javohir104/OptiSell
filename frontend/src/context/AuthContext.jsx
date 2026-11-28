import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/auth.api';
import { tokenStorage, UNAUTHORIZED_EVENT } from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  // Restore session from stored JWT
  useEffect(() => {
    let alive = true;
    if (!tokenStorage.get()) { setBooting(false); return undefined; }
    authApi.me()
      .then((res) => { if (alive) setUser(res.user ?? res); })
      .catch(() => tokenStorage.clear())
      .finally(() => alive && setBooting(false));
    return () => { alive = false; };
  }, []);

  // Backend rejected the token -> drop the session
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const handleAuth = useCallback((res) => {
    if (!res?.token) throw new Error('The server did not return a token');
    tokenStorage.set(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const login = useCallback((email, password) => authApi.login({ email, password }).then(handleAuth), [handleAuth]);
  const loginWithGoogle = useCallback((credential) => authApi.google(credential).then((res) => ({ user: handleAuth(res), created: res.created })), [handleAuth]);
  /** Session obtained elsewhere (Telegram: Google sign-in finished in the external browser). */
  const acceptSession = useCallback((res) => handleAuth(res), [handleAuth]);
  const register = useCallback((payload) => authApi.register(payload).then(handleAuth), [handleAuth]);
  const logout = useCallback(() => { tokenStorage.clear(); setUser(null); }, []);
  /** Re-read the user (e.g. after a payment changed the plan). */
  const refreshUser = useCallback(() => authApi.me().then((res) => { const u = res.user ?? res; setUser(u); return u; }), []);

  const value = useMemo(
    () => ({ user, booting, isAuthenticated: !!user, login, loginWithGoogle, acceptSession, register, logout, refreshUser, setUser }),
    [user, booting, login, loginWithGoogle, acceptSession, register, logout, refreshUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
