// Maps raw onboarding answers → the two submission payloads:
//   buildModelPayload()        → POST /api/predictions (7 BRFSS-coded model features)
//   buildHealthInputsPayload() → POST /api/health-inputs (personalisation + background)
//
// BRFSS 2023 category codes (from ml-service/data/extract_brfss.py and the
// CDC codebook) — the ML service validates against exactly these ranges:
//   age_group             _AGEG5YR:  1=18-24, 2=25-29, 3=30-34 … 12=75-79, 13=80+
//   sex                   SEXVAR:    1=Male, 2=Female
//   bmi                   _BMI5:     continuous, derived from height/weight
//   physical_activity_cat _PACAT3:   1=Highly active, 2=Active,
//                                    3=Insufficiently active, 4=Inactive
//   smoking_status        _SMOKER3:  1=Current daily, 2=Current some days,
//                                    3=Former, 4=Never
//   heavy_drinker         _RFDRHV8:  1=No, 2=Yes (men >14 drinks/week,
//                                    women >7 drinks/week)
//   general_health        GENHLTH:   1=Excellent, 2=Very good, 3=Good,
//                                    4=Fair, 5=Poor

function required(answers, key) {
  const value = answers[key];
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing onboarding answer: ${key}`);
  }
  return value;
}

// _AGEG5YR five-year bands. The model is trained on adults (18+).
export function ageToAgeGroup(age) {
  if (age < 18) throw new Error('Age must be 18 or over');
  if (age < 25) return 1;
  if (age >= 80) return 13;
  return Math.floor((age - 25) / 5) + 2;
}

// Direct mapping to SEXVAR — the form offers exactly the two BRFSS codes
export function genderToSex(gender) {
  return mapOrThrow({ male: 1, female: 2 }, gender, 'gender');
}

export function calculateBmi(heightCm, weightKg) {
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 100) / 100;
}

// Step 4 frequency cards → _PACAT3 (approximation: the form asks weekly
// exercise sessions, BRFSS derives activity level from minutes/intensity)
const EXERCISE_FREQUENCY_TO_PACAT3 = {
  intense: 1, // 5+ sessions a week, often vigorous → Highly active
  regular: 2, // 3-4 sessions a week                → Active
  light: 3,   // 1-2 sessions a week                → Insufficiently active
  rarely: 4,  // Less than once a week              → Inactive
};

// Step 6 smoking cards → _SMOKER3
const SMOKING_TO_SMOKER3 = {
  every_day: 1, // Smoke every day          → Current daily
  some_days: 2, // Smoke some days          → Current some days
  former: 3,    // Used to smoke, quit      → Former
  never: 4,     // Never smoked regularly   → Never
};

// Weekly alcohol estimate (dissertation methodology note):
// The form asks AUDIT-C-style questions — drink frequency + drinks per
// occasion — because they are easier to answer honestly than a raw weekly
// total. BRFSS _RFDRHV8, however, defines heavy drinking as a WEEKLY total
// (>14 drinks men, >7 women), so the two answers are combined into an
// estimated drinks/week using an approximate occasions-per-week multiplier:
//   never            0     no drinking occasions
//   monthly_or_less  0.23  ~1 occasion/month ≈ 12 ÷ 52 weeks
//   2_4_month        0.75  ~3 occasions/month (band midpoint) ≈ 39 ÷ 52
//   2_3_week         2.5   band midpoint
//   4_plus_week      5     midpoint between 4/week and daily (7)
// estimated weekly drinks = multiplier × drinks per occasion.
// These are deliberate approximations of each band's midpoint; the estimate
// only needs to be accurate enough to classify against the _RFDRHV8 cutoffs.
export const DRINK_FREQUENCY_TO_OCCASIONS_PER_WEEK = {
  never: 0,
  monthly_or_less: 0.23,
  '2_4_month': 0.75,
  '2_3_week': 2.5,
  '4_plus_week': 5,
};

export function estimateWeeklyDrinks(drinkFrequency, drinksPerOccasion) {
  const occasions = mapOrThrow(
    DRINK_FREQUENCY_TO_OCCASIONS_PER_WEEK, drinkFrequency, 'drinkFrequency');
  if (occasions === 0) return 0;
  return Math.round(occasions * drinksPerOccasion * 10) / 10;
}

// _RFDRHV8 heavy-drinker definition is sex-specific
export function toHeavyDrinker(drinksPerWeek, gender) {
  const threshold = gender === 'male' ? 14 : 7;
  return drinksPerWeek > threshold ? 2 : 1;
}

// Step 7 slider runs 1=Poor … 5=Excellent (natural "higher is better" for a
// slider), but GENHLTH codes run the other way (1=Excellent … 5=Poor) —
// so the code is 6 − rating.
export function ratingToGenHlth(rating) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error(`Unknown generalHealth rating: ${rating}`);
  }
  return 6 - rating;
}

// Slider rating → text label stored in health_inputs.general_health_rating
const GENERAL_HEALTH_RATING_LABELS = {
  1: 'poor',
  2: 'fair',
  3: 'good',
  4: 'very good',
  5: 'excellent',
};

function mapOrThrow(map, value, field) {
  const code = map[value];
  if (code === undefined) throw new Error(`Unknown ${field} value: ${value}`);
  return code;
}

// The 7 model features for POST /api/predictions
export function buildModelPayload(answers) {
  return {
    age_group: ageToAgeGroup(required(answers, 'age')),
    sex: genderToSex(required(answers, 'gender')),
    bmi: calculateBmi(required(answers, 'heightCm'), required(answers, 'weightKg')),
    physical_activity_cat: mapOrThrow(
      EXERCISE_FREQUENCY_TO_PACAT3, required(answers, 'exerciseFrequency'), 'exerciseFrequency'),
    smoking_status: mapOrThrow(
      SMOKING_TO_SMOKER3, required(answers, 'smokingStatus'), 'smokingStatus'),
    heavy_drinker: toHeavyDrinker(required(answers, 'drinksPerWeek'), answers.gender),
    general_health: ratingToGenHlth(required(answers, 'generalHealth')),
  };
}

// Personalisation + health-background fields for POST /api/health-inputs
// (raw form values — Gemini habit generation reads these in Chunk 3)
export function buildHealthInputsPayload(answers) {
  return {
    sleep_hours: required(answers, 'sleepHours'),
    sleep_quality: required(answers, 'sleepQuality'),
    diet_type: required(answers, 'dietType'),
    meals_per_day: required(answers, 'mealsPerDay'),
    water_intake: required(answers, 'waterGlasses'),
    exercise_frequency: required(answers, 'exerciseFrequency'),
    exercise_types: required(answers, 'exerciseTypes'),
    stress_level: required(answers, 'stressLevel'),
    work_hours: required(answers, 'workHours'),
    screen_time: required(answers, 'screenTimeHours'),
    alcohol_consumption:
      `~${required(answers, 'drinksPerWeek')} drinks/week ` +
      `(estimated from ${required(answers, 'drinkFrequency')})`,
    smoking_status: required(answers, 'smokingStatus'),
    existing_heart_condition: required(answers, 'existingHeartCondition'),
    high_bp_diagnosis: required(answers, 'highBpDiagnosis'),
    diabetes_diagnosis: required(answers, 'diabetesDiagnosis'),
    general_health_rating: mapOrThrow(
      GENERAL_HEALTH_RATING_LABELS, required(answers, 'generalHealth'), 'generalHealth'),
  };
}
