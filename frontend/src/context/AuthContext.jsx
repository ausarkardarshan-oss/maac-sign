import React, { createContext, useContext, useState, useCallback } from 'react';
import { authService } from '../services/authService.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const me = await authService.me();
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const login = useCallback(async (credentials) => {
    const me = await authService.login(credentials);
    setUser(me);
    return me;
  }, []);

  const register = useCallback(async (data) => {
    const me = await authService.register(data);
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  const updateUser = useCallback((updated) => {
    setUser((prev) => ({ ...prev, ...updated }));
  }, []);

  return (
    <AuthContext.Provider value={{ user, authLoading, checkAuth, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export default AuthContext;
