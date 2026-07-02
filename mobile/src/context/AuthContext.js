import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore session on app start
    SecureStore.getItemAsync('aurafit_token').then((token) => {
      if (token) {
        SecureStore.getItemAsync('aurafit_user').then((raw) => {
          if (raw) setUser(JSON.parse(raw));
        });
      }
      setLoading(false);
    });
  }, []);

  async function register(email, password) {
    const { token, user: u } = await api.register(email, password);
    await SecureStore.setItemAsync('aurafit_token', token);
    await SecureStore.setItemAsync('aurafit_user', JSON.stringify(u));
    setUser(u);
  }

  async function login(email, password) {
    const { token, user: u } = await api.login(email, password);
    await SecureStore.setItemAsync('aurafit_token', token);
    await SecureStore.setItemAsync('aurafit_user', JSON.stringify(u));
    setUser(u);
  }

  async function logout() {
    await SecureStore.deleteItemAsync('aurafit_token');
    await SecureStore.deleteItemAsync('aurafit_user');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
