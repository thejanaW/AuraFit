const express = require('express');
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// A user must be within this many metres of a pin's coordinates to claim it.
const CLAIM_RADIUS_METERS = 30;

const LAT_RE = /^-?\d{1,2}(\.\d+)?$/;
const LNG_RE = /^-?\d{1,3}(\.\d+)?$/;

function parseCoords(query) {
  const lat = Number(query.lat);
  const lng = Number(query.lng);
  if (!LAT_RE.test(String(query.lat ?? '')) || !LNG_RE.test(String(query.lng ?? ''))) return null;
  if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

// GET /api/rewards/pins?lat=&lng= — every reward pin with distance from the
// caller's current position and whether this user has already claimed it.
router.get('/pins', requireAuth, async (req, res) => {
  const coords = parseCoords(req.query);
  if (!coords) {
    return res.status(400).json({ error: 'lat and lng query params are required' });
  }

  const { data: pins, error: pinsError } = await supabase.rpc('list_reward_pins_with_distance', {
    user_lat: coords.lat,
    user_lng: coords.lng,
  });
  if (pinsError) {
    return res.status(500).json({ error: `Failed to fetch reward pins: ${pinsError.message}` });
  }

  const { data: claims, error: claimsError } = await supabase
    .from('reward_claims')
    .select('reward_pin_id')
    .eq('user_id', req.userId);
  if (claimsError) {
    return res.status(500).json({ error: `Failed to fetch claims: ${claimsError.message}` });
  }
  const claimedIds = new Set(claims.map((c) => c.reward_pin_id));

  res.json({
    pins: pins.map((pin) => ({ ...pin, claimed: claimedIds.has(pin.id) })),
    claimRadiusMeters: CLAIM_RADIUS_METERS,
  });
});

// POST /api/rewards/claim — Body: { reward_pin_id, lat, lng }
//
// Proximity is checked server-side via PostGIS (reward_pin_distance_meters),
// never trusted from the client beyond the coordinates it reports. Claiming
// is one-time per user per pin: the reward_claims unique constraint is the
// real guard, this lookup just avoids an unnecessary points award attempt.
// Points insert failure rolls back the claim row, mirroring habits.js.
router.post('/claim', requireAuth, async (req, res) => {
  const { reward_pin_id: rewardPinId } = req.body ?? {};
  const coords = parseCoords(req.body ?? {});

  if (typeof rewardPinId !== 'string' || !rewardPinId.trim()) {
    return res.status(400).json({ error: 'reward_pin_id is required' });
  }
  if (!coords) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }

  const { data: pinRows, error: pinError } = await supabase
    .from('reward_pins')
    .select('id, brand_name, reward_value')
    .eq('id', rewardPinId)
    .limit(1);
  if (pinError) {
    return res.status(500).json({ error: `Failed to look up pin: ${pinError.message}` });
  }
  const pin = pinRows[0];
  if (!pin) {
    return res.status(404).json({ error: 'Reward pin not found' });
  }

  const { data: existingRows, error: existingError } = await supabase
    .from('reward_claims')
    .select('*')
    .eq('user_id', req.userId)
    .eq('reward_pin_id', rewardPinId)
    .limit(1);
  if (existingError) {
    return res.status(500).json({ error: `Failed to look up claim: ${existingError.message}` });
  }
  if (existingRows[0]) {
    return res.json({ claim: existingRows[0], alreadyClaimed: true });
  }

  const { data: distance, error: distanceError } = await supabase.rpc('reward_pin_distance_meters', {
    pin_id: rewardPinId,
    lat: coords.lat,
    lng: coords.lng,
  });
  if (distanceError) {
    return res.status(500).json({ error: `Failed to compute distance: ${distanceError.message}` });
  }
  if (distance > CLAIM_RADIUS_METERS) {
    return res.status(403).json({
      error: 'Too far from this reward to claim it',
      distanceMeters: Math.round(distance),
      claimRadiusMeters: CLAIM_RADIUS_METERS,
    });
  }

  const { data: claim, error: claimError } = await supabase
    .from('reward_claims')
    .insert({ user_id: req.userId, reward_pin_id: rewardPinId, points_awarded: pin.reward_value })
    .select()
    .single();
  if (claimError) {
    // Unique violation = a concurrent request already claimed it
    if (claimError.code === '23505') {
      const { data: raceRows } = await supabase
        .from('reward_claims')
        .select('*')
        .eq('user_id', req.userId)
        .eq('reward_pin_id', rewardPinId)
        .limit(1);
      return res.json({ claim: raceRows?.[0] ?? null, alreadyClaimed: true });
    }
    return res.status(500).json({ error: `Failed to save claim: ${claimError.message}` });
  }

  const { error: pointsError } = await supabase
    .from('points')
    .insert({ user_id: req.userId, amount: pin.reward_value, source: 'gps' });
  if (pointsError) {
    await supabase.from('reward_claims').delete().eq('id', claim.id);
    return res.status(500).json({ error: `Failed to award points: ${pointsError.message}` });
  }

  res.status(201).json({ claim, brandName: pin.brand_name, pointsAwarded: pin.reward_value });
});

module.exports = router;
