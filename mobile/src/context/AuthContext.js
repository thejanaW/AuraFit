import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Whether the authed user already has a prediction on record — decides
  // AppNavigator's initial route (Onboarding vs MainTabs). Only meaningful
  // once `user` is set; defaults false so a fresh signup lands on Onboarding.
  const [hasPrediction, setHasPrediction] = useState(false);
  const [loading, setLoading] = useState(true);

  // Resolves prediction status for the now-authenticated user. This doubles
  // as the token-validity check: GET /api/predictions/latest requires auth,
  // so a 401 here means the stored token is stale/expired — treat that
  // exactly like no token at all (clear storage, bounce to Login).
  const resolveSession = useCallback(async (storedUser) => {
    try {
      const { prediction } = await api.getLatestPrediction();
      setUser(storedUser);
      setHasPrediction(!!prediction);
    } catch (err) {
      if (err.status === 401) {
        await SecureStore.deleteItemAsync('aurafit_token');
        await SecureStore.deleteItemAsync('aurafit_user');
        setUser(null);
        setHasPrediction(false);
      } else {
        // Not an auth problem (e.g. network/backend hiccup) — don't punish
        // an otherwise-valid session. Default to MainTabs since that's the
        // common case for a returning user; Home re-fetches the prediction
        // itself and already has its own error/retry handling if it's still
        // unreachable.
        setUser(storedUser);
        setHasPrediction(true);
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      const token = await SecureStore.getItemAsync('aurafit_token');
      if (!token) {
        setLoading(false);
        return;
      }
      const raw = await SecureStore.getItemAsync('aurafit_user');
      const storedUser = raw ? JSON.parse(raw) : null;
      await resolveSession(storedUser);
      setLoading(false);
    })();
  }, [resolveSession]);

  async function register(email, password, name) {
    const { token, user: u } = await api.register(email, password, name);
    await SecureStore.setItemAsync('aurafit_token', token);
    await SecureStore.setItemAsync('aurafit_user', JSON.stringify(u));
    // Brand-new account — skip the network round trip, it can't have a
    // prediction yet. Lands on Onboarding.
    setHasPrediction(false);
    setUser(u);
  }

  async function login(email, password) {
    const { token, user: u } = await api.login(email, password);
    await SecureStore.setItemAsync('aurafit_token', token);
    await SecureStore.setItemAsync('aurafit_user', JSON.stringify(u));
    await resolveSession(u);
  }

  async function logout() {
    await SecureStore.deleteItemAsync('aurafit_token');
    await SecureStore.deleteItemAsync('aurafit_user');
    setUser(null);
    setHasPrediction(false);
  }

  return (
    <AuthContext.Provider value={{ user, loading, hasPrediction, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
