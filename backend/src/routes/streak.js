const express = require('express');
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Display-layer bound: streaks longer than this show as 90 rather than paying
// for an unbounded history scan — fine for the STREAK card's purposes.
const LOOKBACK_DAYS = 90;

// Date-string arithmetic in UTC so device timezones can't shift the calendar
// day the string represents.
function shiftDay(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// GET /api/streak?date=YYYY-MM-DD — consecutive days (ending at the client's
// local today) with AT LEAST ONE completed habit. Deliberately forgiving:
// one habit keeps the day alive, and an unfinished today never breaks the
// streak — the count anchors on yesterday until today's first completion.
router.get('/', requireAuth, async (req, res) => {
  const today = DATE_RE.test(req.query.date ?? '')
    ? req.query.date
    : new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('habits')
    .select('date')
    .eq('user_id', req.userId)
    .eq('completed', true)
    .gte('date', shiftDay(today, -LOOKBACK_DAYS));

  if (error) {
    return res.status(500).json({ error: `Failed to fetch completions: ${error.message}` });
  }

  const activeDays = new Set(data.map((row) => row.date));
  const todayComplete = activeDays.has(today);

  let day = todayComplete ? today : shiftDay(today, -1);
  let streak = 0;
  while (activeDays.has(day) && streak < LOOKBACK_DAYS) {
    streak += 1;
    day = shiftDay(day, -1);
  }

  res.json({ streak, todayComplete });
});

module.exports = router;
