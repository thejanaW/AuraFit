// AuraFit — integration test suite against REAL running services.
//
// No mocks: hits the actual FastAPI ML service and the actual Node/Express
// backend, which itself talks to the real Supabase project and (for
// /api/habits/generate) the real Gemini API. Creates one throwaway test
// user and deletes it (DELETE /auth/account) at the end, so a run leaves
// no residue in the database.
//
// Prerequisites (not automated — start these yourself first):
//   1. ml-service:  cd ml-service && source venv/bin/activate && uvicorn main:app --port 8000
//   2. backend:     cd backend && node src/index.js
//   Both must be reading real .env / venv config (real Supabase + Gemini creds).
//
// Run from backend/:
//   npm run test:integration
// or directly:
//   node tests/integration.test.mjs
//
// There is no test framework installed in this project (see package.json) —
// this is a plain Node script using the built-in fetch, asserting with a
// small pass/fail counter and printing a final summary + non-zero exit
// code on any failure, which is enough to report real pass/fail counts
// without adding a new dependency for a handful of HTTP checks.

const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const API_URL = process.env.API_URL || 'http://localhost:3000';

let pass = 0, fail = 0;
const failures = [];

function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push(name + (extra ? ` -- ${extra}` : ''));
    console.log(`  FAIL  ${name}${extra ? '  (' + extra + ')' : ''}`);
  }
}

async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON body */ }
  return { status: res.status, body };
}

const testEmail = `viva-test-${Date.now()}@aurafit.test`;
const testPassword = 'TestPass123!';
let token = null;
let habitItemId = null;

async function run() {
  console.log('\n=== ML SERVICE (FastAPI, direct) ===');
  {
    const { status, body } = await jsonFetch(`${ML_URL}/health`);
    check('ML /health -> 200 ok', status === 200 && body?.status === 'ok', JSON.stringify(body));
  }
  let validPredictBody;
  {
    validPredictBody = {
      age_group: 5, sex: 1, bmi: 27.4, physical_activity_cat: 2,
      smoking_status: 4, heavy_drinker: 1, general_health: 2,
    };
    const { status, body } = await jsonFetch(`${ML_URL}/predict`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPredictBody),
    });
    check('ML /predict valid payload -> 200', status === 200, `status=${status}`);
    check('ML /predict has overall_health_score 0-100', typeof body?.overall_health_score === 'number' && body.overall_health_score >= 0 && body.overall_health_score <= 100, JSON.stringify(body));
    const bands = body?.risk_breakdown ?? {};
    const bandKeys = ['heart_attack', 'heart_disease', 'diabetes', 'high_bp'];
    check('ML /predict risk_breakdown has all 4 conditions with valid bands',
      bandKeys.every((k) => ['Low', 'Moderate', 'High'].includes(bands[k])), JSON.stringify(bands));
    const probs = body?.raw_probabilities ?? {};
    check('ML /predict raw_probabilities all in [0,1]',
      bandKeys.every((k) => typeof probs[k] === 'number' && probs[k] >= 0 && probs[k] <= 1), JSON.stringify(probs));
  }
  {
    // missing required field -> FastAPI/pydantic 422
    const { status } = await jsonFetch(`${ML_URL}/predict`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ age_group: 5, sex: 1 }),
    });
    check('ML /predict missing fields -> 422', status === 422, `status=${status}`);
  }
  {
    // out-of-range field -> 422
    const { status } = await jsonFetch(`${ML_URL}/predict`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validPredictBody, age_group: 99 }),
    });
    check('ML /predict out-of-range age_group=99 -> 422', status === 422, `status=${status}`);
  }

  console.log('\n=== BACKEND: health ===');
  {
    const { status, body } = await jsonFetch(`${API_URL}/health`);
    check('Backend /health -> 200 ok', status === 200 && body?.status === 'ok', JSON.stringify(body));
  }

  console.log('\n=== BACKEND: auth ===');
  {
    const { status, body } = await jsonFetch(`${API_URL}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword, name: 'Viva Test' }),
    });
    check('POST /auth/register new user -> 201 + token', status === 201 && !!body?.token, `status=${status} body=${JSON.stringify(body)}`);
    token = body?.token ?? null;
  }
  {
    const { status, body } = await jsonFetch(`${API_URL}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword, name: 'Dup' }),
    });
    check('POST /auth/register duplicate email -> 409', status === 409, `status=${status} body=${JSON.stringify(body)}`);
  }
  {
    const { status } = await jsonFetch(`${API_URL}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'no-password@aurafit.test' }),
    });
    check('POST /auth/register missing password -> 400', status === 400, `status=${status}`);
  }
  {
    const { status, body } = await jsonFetch(`${API_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    check('POST /auth/login correct credentials -> 200 + token', status === 200 && !!body?.token, `status=${status}`);
    if (body?.token) token = body.token; // use freshest token going forward
  }
  {
    const { status } = await jsonFetch(`${API_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'wrong-password' }),
    });
    check('POST /auth/login wrong password -> 401', status === 401, `status=${status}`);
  }
  {
    const { status } = await jsonFetch(`${API_URL}/auth/me`);
    check('GET /auth/me without token -> 401', status === 401, `status=${status}`);
  }
  {
    const { status, body } = await jsonFetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    check('GET /auth/me with token -> 200 + correct email', status === 200 && body?.user?.email === testEmail, `status=${status} body=${JSON.stringify(body)}`);
  }
  {
    const { status, body } = await jsonFetch(`${API_URL}/auth/refresh`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    check('POST /auth/refresh with valid token -> 200 + new token', status === 200 && !!body?.token, `status=${status}`);
  }
  {
    const { status } = await jsonFetch(`${API_URL}/auth/refresh`, { method: 'POST' });
    check('POST /auth/refresh missing token -> 401', status === 401, `status=${status}`);
  }

  const authHeader = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  console.log('\n=== BACKEND: predictions (real ML round-trip through backend) ===');
  {
    const { status, body } = await jsonFetch(`${API_URL}/api/predictions/latest`, { headers: authHeader });
    check('GET /api/predictions/latest before any prediction -> 200, prediction null', status === 200 && body?.prediction === null, `status=${status} body=${JSON.stringify(body)}`);
  }
  let predictionId = null;
  {
    const payload = { age_group: 5, sex: 1, bmi: 27.4, physical_activity_cat: 2, smoking_status: 4, heavy_drinker: 1, general_health: 2 };
    const { status, body } = await jsonFetch(`${API_URL}/api/predictions`, {
      method: 'POST', headers: authHeader, body: JSON.stringify(payload),
    });
    check('POST /api/predictions valid input -> 201 + saved row', status === 201 && !!body?.prediction?.id, `status=${status} body=${JSON.stringify(body)}`);
    predictionId = body?.prediction?.id ?? null;
  }
  {
    const { status, body } = await jsonFetch(`${API_URL}/api/predictions`, {
      method: 'POST', headers: authHeader, body: JSON.stringify({ age_group: 99, sex: 1, bmi: 27, physical_activity_cat: 2, smoking_status: 4, heavy_drinker: 1, general_health: 2 }),
    });
    check('POST /api/predictions invalid age_group=99 -> 400', status === 400, `status=${status} body=${JSON.stringify(body)}`);
  }
  {
    const { status, body } = await jsonFetch(`${API_URL}/api/predictions/latest`, { headers: authHeader });
    check('GET /api/predictions/latest after saving -> matches saved id', status === 200 && body?.prediction?.id === predictionId, `status=${status} body=${JSON.stringify(body)}`);
  }

  console.log('\n=== BACKEND: health-inputs ===');
  {
    const payload = {
      sleep_hours: 7, sleep_quality: 4, diet_type: 'balanced', meals_per_day: 3,
      water_intake: 6, exercise_frequency: '3-4x/week', exercise_types: ['running', 'gym'],
      stress_level: 4, work_hours: 8, screen_time: 5, alcohol_consumption: 'occasional',
      smoking_status: 'never', existing_heart_condition: false, high_bp_diagnosis: false,
      diabetes_diagnosis: false, general_health_rating: 'good',
    };
    const { status, body } = await jsonFetch(`${API_URL}/api/health-inputs`, {
      method: 'POST', headers: authHeader, body: JSON.stringify(payload),
    });
    check('POST /api/health-inputs valid -> 201', status === 201 && !!body?.healthInput?.id, `status=${status} body=${JSON.stringify(body)}`);
  }
  {
    const { status } = await jsonFetch(`${API_URL}/api/health-inputs`, {
      method: 'POST', headers: authHeader, body: JSON.stringify({ sleep_hours: 7 }),
    });
    check('POST /api/health-inputs missing fields -> 400', status === 400, `status=${status}`);
  }

  console.log('\n=== BACKEND: habits (incl. real Gemini call, with fallback if it errors) ===');
  const month = new Date().toISOString().slice(0, 7);
  {
    const { status, body } = await jsonFetch(`${API_URL}/api/habits/generate`, {
      method: 'POST', headers: authHeader, body: JSON.stringify({ month }),
    });
    check('POST /api/habits/generate -> 201 with 5 habits', status === 201 && Array.isArray(body?.set?.habits) && body.set.habits.length === 5, `status=${status} body=${JSON.stringify(body)}`);
    habitItemId = body?.set?.habits?.[0]?.id ?? null;
    console.log(`  (source: ${body?.set?.source ?? 'unknown'})`);
  }
  {
    const { status, body } = await jsonFetch(`${API_URL}/api/habits/current-set?month=${month}`, { headers: authHeader });
    check('GET /api/habits/current-set -> matches generated set', status === 200 && body?.set?.habits?.length === 5, `status=${status}`);
  }
  const today = new Date().toISOString().slice(0, 10);
  {
    const { status, body } = await jsonFetch(`${API_URL}/api/habits/today?date=${today}`, { headers: authHeader });
    check('GET /api/habits/today before completion -> empty array', status === 200 && Array.isArray(body?.habits) && body.habits.length === 0, `status=${status} body=${JSON.stringify(body)}`);
  }
  let awardedPoints = 0;
  if (habitItemId) {
    const { status, body } = await jsonFetch(`${API_URL}/api/habits/complete`, {
      method: 'POST', headers: authHeader,
      body: JSON.stringify({ habit_item_id: habitItemId, date: today, completed: true }),
    });
    check('POST /api/habits/complete -> 200, completed true', status === 200 && body?.habit?.completed === true, `status=${status} body=${JSON.stringify(body)}`);
    awardedPoints = body?.habit?.points_value ?? 0;
  } else {
    check('POST /api/habits/complete', false, 'skipped: no habit_item_id from generate step');
  }
  {
    // idempotency: re-sending the same completed=true must not double-award
    const { status, body } = await jsonFetch(`${API_URL}/api/habits/complete`, {
      method: 'POST', headers: authHeader,
      body: JSON.stringify({ habit_item_id: habitItemId, date: today, completed: true }),
    });
    check('POST /api/habits/complete re-sent (idempotent) -> 200, still completed', status === 200 && body?.habit?.completed === true, `status=${status}`);
  }

  console.log('\n=== BACKEND: points & streak ===');
  {
    const { status, body } = await jsonFetch(`${API_URL}/api/points/total`, { headers: authHeader });
    check('GET /api/points/total -> includes habit award', status === 200 && body?.total >= awardedPoints, `status=${status} body=${JSON.stringify(body)}`);
  }
  {
    const { status, body } = await jsonFetch(`${API_URL}/api/streak?date=${today}`, { headers: authHeader });
    check("GET /api/streak -> streak >= 1 after today's completion", status === 200 && body?.streak >= 1 && body?.todayComplete === true, `status=${status} body=${JSON.stringify(body)}`);
  }

  console.log('\n=== BACKEND: rewards ===');
  let anyPin = null;
  {
    const { status, body } = await jsonFetch(`${API_URL}/api/rewards/pins?lat=6.9271&lng=79.8612`, { headers: authHeader });
    check('GET /api/rewards/pins -> 200 with pins array', status === 200 && Array.isArray(body?.pins), `status=${status} body=${JSON.stringify(body)}`);
    anyPin = body?.pins?.[0] ?? null;
    console.log(`  (${body?.pins?.length ?? 0} pins returned near Colombo)`);
  }
  {
    const { status } = await jsonFetch(`${API_URL}/api/rewards/pins?lat=not-a-number&lng=79.8612`, { headers: authHeader });
    check('GET /api/rewards/pins invalid lat -> 400', status === 400, `status=${status}`);
  }
  {
    const { status, body } = await jsonFetch(`${API_URL}/api/rewards/coupons`, { headers: authHeader });
    check('GET /api/rewards/coupons -> 200 with array', status === 200 && Array.isArray(body?.coupons), `status=${status} body=${JSON.stringify(body)}`);
  }
  if (anyPin) {
    // Claim from a deliberately wrong location (North Pole) -> must be
    // rejected as too far, proving the server-side PostGIS distance guard
    // actually runs rather than trusting client coordinates.
    const { status, body } = await jsonFetch(`${API_URL}/api/rewards/claim`, {
      method: 'POST', headers: authHeader,
      body: JSON.stringify({ reward_pin_id: anyPin.id, lat: 90, lng: 0 }),
    });
    check('POST /api/rewards/claim from wrong location -> 403 too far', status === 403, `status=${status} body=${JSON.stringify(body)}`);
  } else {
    console.log('  (skipped claim test: no reward_pins seeded in this DB)');
  }
  {
    const { status } = await jsonFetch(`${API_URL}/api/rewards/claim`, {
      method: 'POST', headers: authHeader, body: JSON.stringify({}),
    });
    check('POST /api/rewards/claim missing body -> 400', status === 400, `status=${status}`);
  }

  console.log('\n=== BACKEND: account deletion (cleanup) ===');
  {
    const { status } = await jsonFetch(`${API_URL}/auth/account`, {
      method: 'DELETE', headers: authHeader, body: JSON.stringify({ password: 'wrong' }),
    });
    check('DELETE /auth/account wrong password -> 401', status === 401, `status=${status}`);
  }
  {
    const { status, body } = await jsonFetch(`${API_URL}/auth/account`, {
      method: 'DELETE', headers: authHeader, body: JSON.stringify({ password: testPassword }),
    });
    check('DELETE /auth/account correct password -> 200 (cleanup)', status === 200 && body?.success === true, `status=${status} body=${JSON.stringify(body)}`);
  }
  {
    const { status } = await jsonFetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    check('GET /auth/me after account deletion -> 404 (user gone)', status === 404, `status=${status}`);
  }

  console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed, ${pass + fail} total ===`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(2);
});
