const express = require('express');
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// A user must be within this many metres of a pin's coordinates to claim it.
const CLAIM_RADIUS_METERS = 30;

const LAT_RE = /^-?\d{1,2}(\.\d+)?$/;
const LNG_RE = /^-?\d{1,3}(\.\d+)?$/;

// Excludes 0/O/1/I/L — avoids characters that look alike when read off a
// screen to redeem in person. 6 chars over this 32-letter alphabet is ~1
// billion combinations, comfortably collision-free for this app's scale, so
// no retry-on-conflict loop (unlike reward_claims' race handling below,
// which guards a genuinely likely concurrent-request case, not this one).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateCouponCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `AURA-${code}`;
}

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

// GET /api/rewards/coupons — every coupon this user has collected via
// claimed_coupons (migration 007), most recent first. Reads through the
// coupon_id FK to coupons for brand_name/description/discount_value — the
// claim endpoint doesn't return this shape itself since it only ever hands
// back the ONE coupon just claimed, not the full collection.
router.get('/coupons', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('claimed_coupons')
    .select('code, claimed_at, coupon:coupons(brand_name, description, discount_value)')
    .eq('user_id', req.userId)
    .order('claimed_at', { ascending: false });
  if (error) {
    return res.status(500).json({ error: `Failed to fetch coupons: ${error.message}` });
  }
  res.json({
    coupons: data
      .filter((row) => row.coupon) // guards against a coupon row deleted after being claimed
      .map((row) => ({ ...row.coupon, code: row.code, claimedAt: row.claimed_at })),
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

  // Coupon reveal (migration 007) — purely additive to the response. The
  // claim + points above have already succeeded and must stay valid even if
  // this fails (e.g. coupons table not seeded yet), so failures here are
  // logged and swallowed rather than rolling anything back. One fixed
  // coupon per pin (not a random cross-brand pick) — claiming Healers Juice
  // Bar always reveals Healers Juice Bar's own coupon.
  let coupon = null;
  const { data: couponRows, error: couponError } = await supabase
    .from('coupons')
    .select('*')
    .eq('reward_pin_id', rewardPinId)
    .limit(1);
  if (couponError) {
    console.error('Failed to look up coupon:', couponError.message);
  } else {
    coupon = couponRows?.[0] ?? null;
  }

  if (coupon) {
    // The code (migration 008) is per-CLAIM, not per-coupon — two different
    // users claiming the same pin get two different redemption codes, even
    // though they see the same brand/discount_value/description. Generated
    // here (not in SQL) so it's guaranteed to be the exact value both this
    // response and GET /api/rewards/coupons later show — one source, read
    // twice, never regenerated.
    const code = generateCouponCode();
    const { error: claimedCouponError } = await supabase
      .from('claimed_coupons')
      .insert({ user_id: req.userId, coupon_id: coupon.id, reward_pin_id: rewardPinId, code });
    if (claimedCouponError) {
      // Still surfaced below for THIS response (so the modal isn't broken
      // over a transient insert failure) — but if the row never saved, it
      // won't be there to read back later on Profile -> My Coupons, so this
      // is worth knowing about, not silently swallowed like other fields here.
      console.error('Failed to save claimed coupon (code will not persist):', claimedCouponError.message);
    }
    coupon = { ...coupon, code };
  }

  res.status(201).json({ claim, brandName: pin.brand_name, pointsAwarded: pin.reward_value, coupon });
});

module.exports = router;
