const express = require('express');
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/points/total — lifetime points total for the authed user.
// Sums client-side rather than via a Postgres aggregate: per-user point rows
// stay small (one per habit completion / GPS claim), and Supabase's PostgREST
// aggregate support isn't guaranteed on across plan tiers.
router.get('/total', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('points')
    .select('amount')
    .eq('user_id', req.userId);

  if (error) {
    return res.status(500).json({ error: `Failed to fetch points: ${error.message}` });
  }

  const total = data.reduce((sum, row) => sum + row.amount, 0);
  res.json({ total });
});

module.exports = router;
