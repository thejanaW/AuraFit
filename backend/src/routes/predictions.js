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
    const mlRes = await fetch(`${mlServiceUrl}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
      signal: AbortSignal.timeout(10_000),
    });
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

module.exports = router;
