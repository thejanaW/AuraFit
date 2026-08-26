// Maps onboarding answers to the two submission payloads:
// buildModelPayload() -> POST /api/predictions (7 BRFSS-coded features)
// buildHealthInputsPayload() -> POST /api/health-inputs (personalisation fields)

function required(answers, key) {
  const value = answers[key];
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing onboarding answer: ${key}`);
  }
  return value;
}

// _AGEG5YR bands. Caps at 13 (80+) so a projected age never falls outside
// the range the model was trained on.
export function ageToAgeGroup(age) {
  if (age < 18) throw new Error('Age must be 18 or over');
  if (age < 25) return 1;
  if (age >= 80) return 13;
  return Math.floor((age - 25) / 5) + 2;
}


// reframes the score as "where you'd land in ~10 years if this continues"
// rather than a current-state snapshot.
export const RISK_PROJECTION_YEARS = 10;

export function genderToSex(gender) {
  return mapOrThrow({ male: 1, female: 2 }, gender, 'gender');
}

export function calculateBmi(heightCm, weightKg) {
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 100) / 100;
}

// _PACAT3
const EXERCISE_FREQUENCY_TO_PACAT3 = {
  intense: 1,
  regular: 2,
  light: 3,
  rarely: 4,
};

// _SMOKER3
const SMOKING_TO_SMOKER3 = {
  every_day: 1,
  some_days: 2,
  former: 3,
  never: 4,
};

// Form asks frequency + drinks per occasion (easier to answer honestly than
// a raw weekly total). BRFSS defines heavy drinking as a weekly figure, so
// convert using each frequency band's rough midpoint in occasions/week.
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

// Sex-specific heavy-drinker cutoff (_RFDRHV8)
export function toHeavyDrinker(drinksPerWeek, gender) {
  const threshold = gender === 'male' ? 14 : 7;
  return drinksPerWeek > threshold ? 2 : 1;
}

// Slider is 1=Poor...5=Excellent, GENHLTH is the opposite, so flip it
export function ratingToGenHlth(rating) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error(`Unknown generalHealth rating: ${rating}`);
  }
  return 6 - rating;
}

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

export function buildModelPayload(answers) {
  const currentAge = required(answers, 'age');
  if (currentAge < 18) throw new Error('Age must be 18 or over');
  return {
    age_group: ageToAgeGroup(currentAge + RISK_PROJECTION_YEARS),
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