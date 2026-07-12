const express = require('express');
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Validation rules mirror the health_inputs table (migration 003).
// type: 'number' | 'string' | 'boolean' | 'string[]'
const FIELD_RULES = {
  sleep_hours:              { type: 'number', min: 0, max: 24 },
  sleep_quality:            { type: 'number', min: 1, max: 5, integer: true }, // 1=Restless … 5=Deep

  diet_type:                { type: 'string' },
  meals_per_day:            { type: 'number', min: 1, max: 10, integer: true },
  water_intake:             { type: 'number', min: 0, max: 30, integer: true },
  exercise_frequency:       { type: 'string' },
  exercise_types:           { type: 'string[]' },
  stress_level:             { type: 'number', min: 1, max: 10, integer: true },
  work_hours:               { type: 'number', min: 0, max: 24 },
  screen_time:              { type: 'number', min: 0, max: 24 },
  alcohol_consumption:      { type: 'string' },
  smoking_status:           { type: 'string' },
  existing_heart_condition: { type: 'boolean' },
  high_bp_diagnosis:        { type: 'boolean' },
  diabetes_diagnosis:       { type: 'boolean' },
  general_health_rating:    { type: 'string' },
};

function validateHealthInput(body) {
  const errors = [];
  const values = {};
  for (const [field, rule] of Object.entries(FIELD_RULES)) {
    const value = body?.[field];
    if (value === undefined || value === null) {
      errors.push(`${field} is required`);
      continue;
    }
    if (rule.type === 'number') {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        errors.push(`${field} must be a number`);
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
    } else if (rule.type === 'string') {
      if (typeof value !== 'string' || value.trim() === '') {
        errors.push(`${field} must be a non-empty string`);
        continue;
      }
    } else if (rule.type === 'boolean') {
      if (typeof value !== 'boolean') {
        errors.push(`${field} must be true or false`);
        continue;
      }
    } else if (rule.type === 'string[]') {
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
        errors.push(`${field} must be an array of strings`);
        continue;
      }
    }
    values[field] = value;
  }
  return { errors, values };
}

// POST /api/health-inputs — store the onboarding form's personalisation +
// health-background answers for the authed user (consumed by Gemini habit
// generation in Chunk 3; the ML model gets its inputs via /api/predictions)
router.post('/', requireAuth, async (req, res) => {
  const { errors, values } = validateHealthInput(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Invalid input', details: errors });
  }

  const { data, error } = await supabase
    .from('health_inputs')
    .insert({ user_id: req.userId, ...values })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: `Failed to save health inputs: ${error.message}` });
  }

  res.status(201).json({ healthInput: data });
});

module.exports = router;
