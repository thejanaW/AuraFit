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
  if (!res.ok) {
    // Attach the full body so callers needing extra fields (e.g. the reward
    // claim endpoint's distanceMeters on a 403) don't have to re-fetch them.
    const err = new Error(data.error || 'Request failed');
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  register: (email, password, name) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),

  login: (email, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  refresh: () => request('/auth/refresh', { method: 'POST' }),

  // Throws 401 (err.message 'Incorrect password') if the password doesn't
  // match — callers should surface that inline rather than as a generic error.
  deleteAccount: (password) =>
    request('/auth/account', { method: 'DELETE', body: JSON.stringify({ password }) }),

  // Returns { user: { id, email, name, created_at } } for the authed user.
  getMe: () => request('/auth/me'),

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

  // Returns { streak, todayComplete } — consecutive days with ≥1 completed
  // habit, ending at the device's local today.
  getStreak: (date) => request(`/api/streak?date=${encodeURIComponent(date)}`),

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

  // Returns { pins: [{id, brand_name, description, reward_value, lat, lng,
  // distance_m, claimed}], claimRadiusMeters } — every reward pin with live
  // distance from the given position.
  getRewardPins: (lat, lng) =>
    request(`/api/rewards/pins?lat=${lat}&lng=${lng}`),

  // Throws with err.data.distanceMeters/claimRadiusMeters when out of range.
  claimReward: (rewardPinId, lat, lng) =>
    request('/api/rewards/claim', {
      method: 'POST',
      body: JSON.stringify({ reward_pin_id: rewardPinId, lat, lng }),
    }),

  // Returns { coupons: [{ id, brand_name, description, discount_value,
  // claimedAt }] }, most recently claimed first — the full collection, for
  // the Profile -> My Coupons screen (distinct from claimReward's response,
  // which only ever carries the single coupon just claimed).
  getClaimedCoupons: () => request('/api/rewards/coupons'),
};
