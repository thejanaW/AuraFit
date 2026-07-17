// Gemini habit generation + score reasoning — ONE combined API call, per the
// project decision that habits and reasoning must stay consistent with each
// other. Gemini personalises; it never replaces the scikit-learn scoring.
//
// Throws on any failure (network, API error, malformed/incomplete JSON) —
// the route catches and falls back to constants/fallbackHabits.js, so this
// module never needs to be defensive about partial results.

// gemini-flash-latest tracks Google's current flash model — pinned names get
// retired for new API keys (gemini-2.5-flash already 404s for this project's
// key). Override with GEMINI_MODEL in .env if a specific pin is ever needed.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

const CONDITION_LABELS = {
  heart_attack: 'Heart attack',
  heart_disease: 'Heart disease',
  diabetes: 'Diabetes',
  high_bp: 'High blood pressure',
};

// Personalisation-only health_inputs fields worth showing Gemini, with
// human-readable labels (raw column names would waste prompt clarity)
const LIFESTYLE_LABELS = {
  sleep_hours: 'Sleep per night (hours)',
  sleep_quality: 'Sleep quality (1=restless … 5=deep)',
  diet_type: 'Diet type',
  meals_per_day: 'Meals per day',
  water_intake: 'Water intake (glasses/day)',
  exercise_frequency: 'Exercise frequency',
  exercise_types: 'Exercise types',
  stress_level: 'Stress level (1-10)',
  work_hours: 'Work hours per day',
  screen_time: 'Screen time (hours/day)',
  alcohol_consumption: 'Alcohol',
  smoking_status: 'Smoking',
  existing_heart_condition: 'Existing heart condition',
  high_bp_diagnosis: 'Diagnosed high blood pressure',
  diabetes_diagnosis: 'Diagnosed diabetes',
  general_health_rating: 'Self-rated general health',
};

function riskSection(riskBreakdown) {
  if (!riskBreakdown) return 'No risk assessment on record yet.';
  return Object.entries(CONDITION_LABELS)
    .map(([key, label]) => `- ${label}: ${riskBreakdown[key] ?? 'Unknown'}`)
    .join('\n');
}

function lifestyleSection(healthInputs) {
  if (!healthInputs) return 'No lifestyle answers on record yet.';
  const lines = [];
  for (const [field, label] of Object.entries(LIFESTYLE_LABELS)) {
    const value = healthInputs[field];
    if (value === undefined || value === null) continue;
    const rendered = Array.isArray(value)
      ? value.join(', ')
      : typeof value === 'boolean'
        ? (value ? 'yes' : 'no')
        : String(value);
    lines.push(`- ${label}: ${rendered}`);
  }
  return lines.length > 0 ? lines.join('\n') : 'No lifestyle answers on record yet.';
}

// previousMonth: { month: 'YYYY-MM', habits: [{ title, points_value, completedDays, totalDays }] }
function previousMonthSection(previousMonth) {
  if (!previousMonth) {
    return 'This is their FIRST generated habit set — no previous month to build on.';
  }
  const lines = previousMonth.habits.map((h) => {
    const pct = h.totalDays > 0 ? Math.round((h.completedDays / h.totalDays) * 100) : 0;
    return `- "${h.title}": completed ${h.completedDays}/${h.totalDays} days (${pct}%)`;
  });
  return `Last month's (${previousMonth.month}) habits and completion rates:\n${lines.join('\n')}`;
}

function buildPrompt({ riskBreakdown, healthInputs, previousMonth }) {
  return `You are the habit coach inside AuraFit, a health app. A machine-learning model has estimated the user's ~10-year risk band (Low/Moderate/High, relative to peers their age) for four conditions. Your job is to (1) design their next month's daily habit checklist and (2) explain their risk result in plain language.

USER'S ~10-YEAR RISK BANDS (risk indicators, NOT diagnoses):
${riskSection(riskBreakdown)}

USER'S LIFESTYLE ANSWERS:
${lifestyleSection(healthInputs)}

PREVIOUS MONTH:
${previousMonthSection(previousMonth)}

RULES:
1. Generate EXACTLY 5 daily habits targeting this user's highest-risk conditions and weakest lifestyle answers. Each habit must be a small, concrete, measurable daily action (like "Walk 7,000 steps"), doable by an ordinary person.
2. Each habit: "title" (max 40 characters, actionable and specific), "subtext" (ONE short sentence, max 70 characters, why it matters for THEIR risk), "points_value" (integer 15-30, higher = more effort).
3. Progressive difficulty, only when previous-month data exists: habits completed on more than 80% of days should return SLIGHTLY harder (modest increase in steps, duration, or amount — never a big jump); habits below 40% completion should stay at the same difficulty or get easier; everything between stays roughly the same. Carried-over habits may be rephrased but should stay recognisable.
4. "reasoning": 2-3 sentences explaining in plain language why their risk breakdown looks the way it does, referencing their actual bands and lifestyle answers. Motivational and factual. NOT clinical, NOT alarming. Frame it as a risk indicator that habits can influence, never a diagnosis or prediction of illness.
5. Respond with ONLY valid JSON — no markdown fences, no commentary — in exactly this shape:
{"habits":[{"title":"...","subtext":"...","points_value":20},{"title":"...","subtext":"...","points_value":20},{"title":"...","subtext":"...","points_value":20},{"title":"...","subtext":"...","points_value":20},{"title":"...","subtext":"...","points_value":20}],"reasoning":"..."}`;
}

function validateGenerated(parsed) {
  if (!Array.isArray(parsed?.habits) || parsed.habits.length !== 5) {
    throw new Error('Gemini response did not contain exactly 5 habits');
  }
  const habits = parsed.habits.map((h) => {
    const title = typeof h?.title === 'string' ? h.title.trim() : '';
    const subtext = typeof h?.subtext === 'string' ? h.subtext.trim() : '';
    if (!title || !subtext) {
      throw new Error('Gemini habit missing title or subtext');
    }
    const rawPoints = Math.round(Number(h?.points_value));
    if (!Number.isFinite(rawPoints)) {
      throw new Error('Gemini habit has a non-numeric points_value');
    }
    return {
      title: title.slice(0, 60),
      subtext: subtext.slice(0, 90),
      // Clamp rather than reject — a habit set with points_value 12 or 35 is
      // still perfectly usable, not worth discarding the whole response over
      points_value: Math.min(30, Math.max(15, rawPoints)),
    };
  });
  const reasoning = typeof parsed?.reasoning === 'string' ? parsed.reasoning.trim() : '';
  if (!reasoning) {
    throw new Error('Gemini response missing reasoning text');
  }
  return { habits, reasoning };
}

async function callGemini(prompt, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: 'application/json',
      },
    }),
    // Generous timeout: this is a once-a-month, button-triggered call with a
    // visible spinner — better to wait out a slow response than fall back
    signal: AbortSignal.timeout(60_000),
  });
}

async function generateHabitSet({ riskBreakdown, healthInputs, previousMonth }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const prompt = buildPrompt({ riskBreakdown, healthInputs, previousMonth });
  let res = await callGemini(prompt, apiKey);

  // One retry on transient overload/rate-limit — without it, a momentary 503
  // on the generate tap would lock the user's whole month to the fallback set
  if (res.status === 503 || res.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    res = await callGemini(prompt, apiKey);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini response contained no text');

  // responseMimeType asks for raw JSON, but strip fences defensively anyway
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return validateGenerated(JSON.parse(cleaned));
}

module.exports = { generateHabitSet, GEMINI_MODEL };
