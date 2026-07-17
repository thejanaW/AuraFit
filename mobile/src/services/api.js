import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

async function request(path, options = {}) {
  const token = await SecureStore.getItemAsync('aurafit_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  register: (email, password) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  login: (email, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  refresh: () => request('/auth/refresh', { method: 'POST' }),

  saveHealthInputs: (payload) =>
    request('/api/health-inputs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createPrediction: (payload) =>
    request('/api/predictions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Returns { prediction, previous } — both null-safe; previous feeds the
  // Home screen's trend card without a second request.
  getLatestPrediction: () => request('/api/predictions/latest'),

  // Returns { total } — lifetime points sum for the authed user.
  getPointsTotal: () => request('/api/points/total'),

  // Habits — the monthly set is Gemini-generated server-side; these read it
  // and persist per-day completion + points. `date`/`month` are the DEVICE's
  // local values so "today"/"this month" roll over on the phone's clock.

  // Returns { set } — { id, month, reasoning, source, habits: [...] } or null
  // if this month hasn't been generated yet.
  getCurrentHabitSet: (month) =>
    request(`/api/habits/current-set?month=${encodeURIComponent(month)}`),

  // Creates this month's set (Gemini, falling back to the default list
  // server-side). Idempotent — returns the existing set if one exists.
  generateHabitSet: (month) =>
    request('/api/habits/generate', {
      method: 'POST',
      body: JSON.stringify({ month }),
    }),

  getTodayHabits: (date) =>
    request(`/api/habits/today?date=${encodeURIComponent(date)}`),

  // payload: { habit_item_id, date, completed } — toggles the habit; points
  // amount is looked up server-side from the generated habit item.
  toggleHabit: (payload) =>
    request('/api/habits/complete', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
