const express = require('express');
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Validation rules mirror the ML service's Pydantic model (BRFSS category codes)
const FIELD_RULES = {
  age_group:             { min: 1, max: 13, integer: true },
  sex:                   { min: 1, max: 2, integer: true },
  bmi:                   { min: 10, max: 100, integer: false },
  physical_activity_cat: { min: 1, max: 4, integer: true },
  smoking_status:        { min: 1, max: 4, integer: true },
  heavy_drinker:         { min: 1, max: 2, integer: true },
  general_health:        { min: 1, max: 5, integer: true },
};

function validateLifestyleInput(body) {
  const errors = [];
  const values = {};
  for (const [field, rule] of Object.entries(FIELD_RULES)) {
    const value = body?.[field];
    if (typeof value !== 'number' || Number.isNaN(value)) {
      errors.push(`${field} is required and must be a number`);
      continue;
    }
    if (rule.integer && !Number.isInteger(value)) {
      errors.push(`${field} must be an integer`);
      continue;
    }
    if (value < rule.min || value > rule.max) {
      errors.push(`${field} must be between ${rule.min} and ${rule.max}`);
      continue;
    }
    values[field] = value;
  }
  return { errors, values };
}

// The ML service runs on a free instance that spins down after ~15 minutes
// idle. Waking it takes 30-60s, and while it wakes the platform's edge answers
// with its own 502/503 — the request never reaches uvicorn, so a generous
// timeout alone does not help. Retry those statuses (and outright connection
// failures) a couple of times so the first prediction after a quiet period
// pays a wait instead of failing. A warm service answers in ~0.1s, so this
// costs nothing in the normal case.
const ML_COLD_START_STATUSES = new Set([502, 503, 504]);
// Backoff totalling ~54s, measured against a real cold start that took 42s.
// The edge can reject instantly while waking, so a short retry budget would
// give up long before the service is ready.
const ML_RETRY_DELAYS_MS = [3000, 6000, 10000, 15000, 20000];

async function callMlService(mlServiceUrl, values) {
  let lastError;
  const ML_RETRIES = ML_RETRY_DELAYS_MS.length;
  for (let attempt = 0; attempt <= ML_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, ML_RETRY_DELAYS_MS[attempt - 1]));
    }
    try {
      const res = await fetch(`${mlServiceUrl}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
        signal: AbortSignal.timeout(60_000),
      });
      if (!ML_COLD_START_STATUSES.has(res.status)) return res;
      lastError = null;
      // Retry-worthy status — fall through and try again, but hand the last
      // response back if we run out of attempts so the caller can report it.
      if (attempt === ML_RETRIES) return res;
    } catch (err) {
      // Connection reset mid-wake is the same situation as a 502; only give up
      // once the attempts are exhausted.
      lastError = err;
      if (attempt === ML_RETRIES) throw err;
    }
  }
  throw lastError ?? new Error('ML service unreachable');
}

// POST /api/predictions — run ML prediction for the authed user and store it
router.post('/', requireAuth, async (req, res) => {
  const { errors, values } = validateLifestyleInput(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Invalid input', details: errors });
  }

  // Call the FastAPI ML service
  const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:8000';
  let mlResult;
  try {
    const mlRes = await callMlService(mlServiceUrl, values);
    if (!mlRes.ok) {
      const detail = await mlRes.text().catch(() => '');
      return res.status(502).json({
        error: 'ML service returned an error',
        status: mlRes.status,
        detail,
      });
    }
    mlResult = await mlRes.json();
  } catch (err) {
    // Connection refused / timeout — the backend stays up, client gets a clear 503
    return res.status(503).json({
      error: 'ML service unavailable — is it running?',
      detail: err.message,
    });
  }

  const { overall_health_score, risk_breakdown, raw_probabilities } = mlResult;

  const { data, error } = await supabase
    .from('predictions')
    .insert({
      user_id: req.userId,
      predicted_health_score: overall_health_score,
      heart_attack_risk: raw_probabilities.heart_attack,
      heart_disease_risk: raw_probabilities.heart_disease,
      diabetes_risk: raw_probabilities.diabetes,
      high_bp_risk: raw_probabilities.high_bp,
      risk_breakdown,
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: `Failed to save prediction: ${error.message}` });
  }

  res.status(201).json({ prediction: data });
});

// GET /api/predictions/latest — most recent prediction for the authed user.
// Also returns the one before it (`previous`) so the Home screen can compute
// the week-trend delta without a second round trip. Both are null-safe:
// { prediction: null } means the user hasn't completed onboarding yet.
router.get('/latest', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('predictions')
    .select('*')
    .eq('user_id', req.userId)
    .order('created_at', { ascending: false })
    .limit(2);

  if (error) {
    return res.status(500).json({ error: `Failed to fetch predictions: ${error.message}` });
  }

  res.json({
    prediction: data[0] ?? null,
    previous: data[1] ?? null,
  });
});

module.exports = router;
