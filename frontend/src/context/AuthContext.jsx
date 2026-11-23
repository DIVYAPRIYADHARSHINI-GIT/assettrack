import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, setUnauthorizedHandler, tokenStore } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  const clear = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler((message) => {
      if (tokenStore.get()) toast.error(message || 'Your session ended. Please sign in again.');
      clear();
    });
  }, [clear]);

  // Restore the session on load.
  useEffect(() => {
    if (!tokenStore.get()) return;
    api('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => clear())
      .finally(() => setLoading(false));
  }, [clear]);

  const login = useCallback(async (email, password) => {
    const r = await api('/auth/login', { method: 'POST', body: { email, password } });
    tokenStore.set(r.token);
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* token may already be invalid; sign out locally anyway */
    }
    clear();
  }, [clear]);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAdmin: user?.role === 'ADMIN',
      login,
      logout,
      setSession: (token, u) => {
        tokenStore.set(token);
        setUser(u);
      },
    }),
    [user, loading, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
