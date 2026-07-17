const express = require('express');
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { generateHabitSet } = require('../services/gemini');
const { FALLBACK_HABITS, FALLBACK_REASONING } = require('../constants/fallbackHabits');

const router = express.Router();

// Dates/months are the CLIENT's local calendar (YYYY-MM-DD / YYYY-MM): the
// phone decides when "today" and "this month" roll over, so a late-night user
// in a timezone ahead of the server isn't split across two days.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

function previousMonthOf(month) {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(year, m - 2, 1); // JS months 0-based, so m-2 = previous
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(month) {
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m, 0).getDate();
}

// A month's habit set with its items, sorted by position — or null.
async function fetchSet(userId, month) {
  const { data, error } = await supabase
    .from('habit_sets')
    .select('*, habit_set_items(*)')
    .eq('user_id', userId)
    .eq('month', month)
    .maybeSingle();
  if (error) throw new Error(`Failed to fetch habit set: ${error.message}`);
  if (!data) return null;
  const { habit_set_items: items, ...set } = data;
  return { ...set, habits: [...items].sort((a, b) => a.position - b.position) };
}

// Previous month's set with per-habit completion counts, for the Gemini
// progressive-difficulty rules — or null if that month was never generated.
async function previousMonthPerformance(userId, month) {
  const prevMonth = previousMonthOf(month);
  const prevSet = await fetchSet(userId, prevMonth);
  if (!prevSet) return null;

  const itemIds = prevSet.habits.map((h) => h.id);
  const { data: rows, error } = await supabase
    .from('habits')
    .select('habit_item_id')
    .eq('user_id', userId)
    .eq('completed', true)
    .in('habit_item_id', itemIds);
  if (error) throw new Error(`Failed to fetch completions: ${error.message}`);

  const counts = {};
  for (const row of rows) {
    counts[row.habit_item_id] = (counts[row.habit_item_id] ?? 0) + 1;
  }
  const totalDays = daysInMonth(prevMonth);
  return {
    month: prevMonth,
    habits: prevSet.habits.map((h) => ({
      title: h.title,
      points_value: h.points_value,
      completedDays: counts[h.id] ?? 0,
      totalDays,
    })),
  };
}

// GET /api/habits/current-set?month=YYYY-MM — the month's generated habit set
// (habits + reasoning), or { set: null } if it hasn't been generated yet.
router.get('/current-set', requireAuth, async (req, res) => {
  const month = MONTH_RE.test(req.query.month ?? '')
    ? req.query.month
    : new Date().toISOString().slice(0, 7);
  try {
    const set = await fetchSet(req.userId, month);
    res.json({ set });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/habits/generate — create this month's habit set via Gemini.
// Body: { month: 'YYYY-MM' }
//
// Gathers the user's latest risk breakdown + health inputs + previous month's
// completion rates, asks Gemini for 5 habits + a score-reasoning paragraph in
// one call, and stores the result. On ANY Gemini failure (API error, bad
// JSON, missing fields) it stores the hardcoded fallback list instead — the
// user always ends up with a working checklist, and `source` records which
// path produced it. Idempotent: if the month already has a set, returns it
// unchanged rather than generating a duplicate.
router.post('/generate', requireAuth, async (req, res) => {
  const month = typeof req.body?.month === 'string' && MONTH_RE.test(req.body.month)
    ? req.body.month
    : new Date().toISOString().slice(0, 7);

  try {
    const existing = await fetchSet(req.userId, month);
    if (existing) {
      return res.json({ set: existing, alreadyExisted: true });
    }

    const [predictionRes, inputsRes, previousMonth] = await Promise.all([
      supabase
        .from('predictions')
        .select('risk_breakdown')
        .eq('user_id', req.userId)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('health_inputs')
        .select('*')
        .eq('user_id', req.userId)
        .order('created_at', { ascending: false })
        .limit(1),
      previousMonthPerformance(req.userId, month),
    ]);
    if (predictionRes.error) throw new Error(`Failed to fetch prediction: ${predictionRes.error.message}`);
    if (inputsRes.error) throw new Error(`Failed to fetch health inputs: ${inputsRes.error.message}`);

    let habits;
    let reasoning;
    let source;
    try {
      ({ habits, reasoning } = await generateHabitSet({
        riskBreakdown: predictionRes.data[0]?.risk_breakdown ?? null,
        healthInputs: inputsRes.data[0] ?? null,
        previousMonth,
      }));
      source = 'gemini';
    } catch (err) {
      console.error(`Gemini generation failed for user ${req.userId}, using fallback:`, err.message);
      habits = FALLBACK_HABITS;
      reasoning = FALLBACK_REASONING;
      source = 'fallback';
    }

    const { data: setRow, error: setError } = await supabase
      .from('habit_sets')
      .insert({ user_id: req.userId, month, reasoning, source })
      .select()
      .single();
    if (setError) throw new Error(`Failed to save habit set: ${setError.message}`);

    const { data: items, error: itemsError } = await supabase
      .from('habit_set_items')
      .insert(
        habits.map((h, index) => ({
          set_id: setRow.id,
          user_id: req.userId,
          title: h.title,
          subtext: h.subtext,
          points_value: h.points_value,
          position: index,
        }))
      )
      .select();
    if (itemsError) {
      // Don't leave a habit-less set behind — it would permanently block regeneration
      await supabase.from('habit_sets').delete().eq('id', setRow.id);
      throw new Error(`Failed to save habits: ${itemsError.message}`);
    }

    res.status(201).json({
      set: { ...setRow, habits: [...items].sort((a, b) => a.position - b.position) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/habits/today?date=YYYY-MM-DD — the authed user's completion rows
// for that day (each references a habit_set_items row via habit_item_id).
router.get('/today', requireAuth, async (req, res) => {
  const date = DATE_RE.test(req.query.date ?? '')
    ? req.query.date
    : new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', req.userId)
    .eq('date', date);

  if (error) {
    return res.status(500).json({ error: `Failed to fetch habits: ${error.message}` });
  }

  res.json({ date, habits: data });
});

// POST /api/habits/complete — toggle a generated habit for a given day.
// Body: { habit_item_id, date, completed }
//
// The habit's identity and points_value come from its habit_set_items row
// (server-authoritative — the client can no longer send its own points).
// Creates the day's completion row on first toggle, updates it afterwards.
// Points side effects: completing inserts a points row (source 'habit');
// un-completing deletes the matching award again, so check/uncheck cycles
// can't be farmed for points. Idempotent — re-sending the current state
// (e.g. a double-tap) changes nothing and never double-awards.
router.post('/complete', requireAuth, async (req, res) => {
  const { habit_item_id: habitItemId, date, completed } = req.body ?? {};

  if (typeof habitItemId !== 'string' || !habitItemId.trim()) {
    return res.status(400).json({ error: 'habit_item_id is required' });
  }
  if (typeof date !== 'string' || !DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }
  if (typeof completed !== 'boolean') {
    return res.status(400).json({ error: 'completed must be a boolean' });
  }

  // Ownership check doubles as the points_value lookup
  const { data: itemRows, error: itemError } = await supabase
    .from('habit_set_items')
    .select('*')
    .eq('id', habitItemId)
    .eq('user_id', req.userId)
    .limit(1);
  if (itemError) {
    return res.status(500).json({ error: `Failed to look up habit: ${itemError.message}` });
  }
  const item = itemRows[0];
  if (!item) {
    return res.status(404).json({ error: 'Habit not found' });
  }

  const { data: existingRows, error: findError } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', req.userId)
    .eq('date', date)
    .eq('habit_item_id', habitItemId)
    .limit(1);
  if (findError) {
    return res.status(500).json({ error: `Failed to look up completion: ${findError.message}` });
  }
  const existing = existingRows[0] ?? null;

  if (existing && existing.completed === completed) {
    return res.json({ habit: existing });
  }

  let habit;
  if (existing) {
    const { data, error } = await supabase
      .from('habits')
      .update({ completed })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) {
      return res.status(500).json({ error: `Failed to update habit: ${error.message}` });
    }
    habit = data;
  } else {
    const { data, error } = await supabase
      .from('habits')
      .insert({
        user_id: req.userId,
        habit_item_id: habitItemId,
        title: item.title, // snapshot for direct table readability
        date,
        completed,
        points_value: item.points_value,
      })
      .select()
      .single();
    if (error) {
      return res.status(500).json({ error: `Failed to save habit: ${error.message}` });
    }
    habit = data;
  }

  if (completed) {
    const { error: pointsError } = await supabase
      .from('points')
      .insert({ user_id: req.userId, amount: habit.points_value, source: 'habit' });
    if (pointsError) {
      // Roll the completion back so habit state and points can't drift apart
      await supabase.from('habits').update({ completed: false }).eq('id', habit.id);
      return res.status(500).json({ error: `Failed to award points: ${pointsError.message}` });
    }
  } else if (existing?.completed) {
    // points has no habit reference column, so target the most recent matching
    // award (same user / source / amount). Best-effort: a missing row just
    // means there's nothing to claw back.
    const { data: awards } = await supabase
      .from('points')
      .select('id')
      .eq('user_id', req.userId)
      .eq('source', 'habit')
      .eq('amount', habit.points_value)
      .order('created_at', { ascending: false })
      .limit(1);
    if (awards?.[0]) {
      await supabase.from('points').delete().eq('id', awards[0].id);
    }
  }

  res.json({ habit });
});

module.exports = router;
