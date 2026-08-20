# GPS Reward Map — Technical Walkthrough

*Prepared for supervisor code review — traces the full data flow of the GPS reward
claiming feature (Chunk 4), function by function, in the order data actually
moves through the system.*

---

## Summary (read this bit out loud first)

The phone asks the OS for the user's GPS location using `expo-location`. Once it
has that, the Map screen sends the coordinates to the backend, which asks
Postgres/PostGIS (via a database function) to work out how far every seeded
reward pin is from that position, and sends the whole list back so the map can
draw markers and show live distances. When the user taps a pin and hits "Claim
reward," the phone sends its current coordinates again, along with the pin's
ID, to a claim endpoint. The backend **never trusts the distance the phone
already showed it** — it independently recalculates the distance server-side
using the same PostGIS function, and only if that comes back under 30 metres
does it write a `reward_claims` row and award points. The result (success,
already-claimed, or too-far-away) goes back to the phone, which updates the
claim card, the pin colour, and shows a message — no page reload needed.

The core design decision worth saying out loud in the review: **the client's
GPS reading is only ever used to ask "am I close?" — the actual proof of
proximity is recomputed independently on the server using PostGIS**, so a
user can't fake being near a pin by tampering with the app.

---

## Step 1 — Where the data comes from

**Two independent data sources feed this feature:**

**1a. Device GPS position** — read live, on-device, via the `expo-location`
library. Nothing is stored for this; it's fetched fresh every time the screen
needs it.

**1b. Reward pin data** — stored in the `reward_pins` table, seeded once via a
migration, not generated at runtime.

`backend/migrations/005_reward_claims.sql`, lines 92–101:

```sql
insert into reward_pins (brand_name, description, location, reward_value) values
  ('Oxygen Fitness Center', 'Gym — 10% off a day pass (placeholder reward)',
   ST_SetSRID(ST_MakePoint(79.884835, 6.786804), 4326), 30),
  ...
on conflict do nothing;
```

Plain English: this is a one-time INSERT of 8 real Colombo/Moratuwa businesses.
`ST_MakePoint(lng, lat)` builds a PostGIS point (note: longitude first, that's
the PostGIS convention, easy to get backwards), `ST_SetSRID(..., 4326)` tags it
as using WGS84 — the standard lat/lng coordinate system GPS itself uses. This
table is the "menu" of claimable pins that every other step reads from.

---

## Step 2 — Location permission request + current position fetch (Map screen)

`mobile/src/screens/MapScreen.js`, lines 64–81 — `refreshLocation`:

```js
const refreshLocation = useCallback(async () => {
  setLoading(true);
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setPermissionDenied(true);
      return;
    }
    setPermissionDenied(false);
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setPosition(loc.coords);
    await loadPins(loc.coords);
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
}, [loadPins]);
```

Plain English: this is the function that runs every time the map needs a fresh
location — on first mount, and whenever the user taps the manual refresh
button. First it asks iOS/Android for permission
(`requestForegroundPermissionsAsync`). If the user says no, it sets
`permissionDenied` and **returns early** — it does not attempt to call
`getCurrentPositionAsync` without permission, since that would just throw.
If permission is granted, it fetches a real GPS fix (`Accuracy.High`), stores
it in the `position` state, and immediately calls `loadPins` (Step 3) so the
pin list has something to calculate distances against. This function is wired
up in two places:

`mobile/src/screens/MapScreen.js`, lines 83–85:
```js
useEffect(() => {
  refreshLocation();
}, [refreshLocation]);
```
— runs once when the screen first mounts.

**Error handling — no GPS permission:** if `status !== 'granted'`, the screen
renders a dedicated fallback UI instead of a blank/broken map.

`mobile/src/screens/MapScreen.js`, lines 130–142:
```js
if (permissionDenied) {
  return (
    <View style={styles.center}>
      <Ionicons name="location-outline" size={32} color={colors.textSecondary} />
      <Text style={styles.permissionText}>
        Location access is needed to find nearby reward pins and verify you're close enough to claim one.
      </Text>
      <TouchableOpacity style={styles.retryButton} onPress={refreshLocation} activeOpacity={0.8}>
        <Text style={styles.retryButtonText}>Grant location access</Text>
      </TouchableOpacity>
    </View>
  );
}
```
This gives the user a clear explanation and a retry button that just calls
`refreshLocation` again (e.g. after they've enabled location in Settings).

---

## Step 3 — Fetching and rendering reward pins on the map

This step has four parts: the client-side fetch function, the API call it
makes, the backend route that handles it, and the PostGIS function that does
the actual math. Then the map renders the result.

### 3a. Client-side fetch — `loadPins`

`mobile/src/screens/MapScreen.js`, lines 53–62:

```js
const loadPins = useCallback(async (coords) => {
  try {
    const res = await api.getRewardPins(coords.latitude, coords.longitude);
    setPins(res.pins);
    setClaimRadius(res.claimRadiusMeters);
    setError(null);
  } catch (err) {
    setError(err.message);
  }
}, []);
```

Plain English: takes the device's current coordinates, asks the backend for
every pin plus its live distance from those coordinates, and stores the
result in `pins` state (which the `<MapView>` below reads to draw markers).
It also stores `claimRadiusMeters` — the server tells the client how close is
"close enough," rather than the client hardcoding that number, so the two
sides can't drift out of sync.

This isn't only called once. `useFocusEffect` re-runs it every time the user
comes back to the Map tab, without resetting the map's camera position:

`mobile/src/screens/MapScreen.js`, lines 89–93:
```js
useFocusEffect(
  useCallback(() => {
    if (position) loadPins(position);
  }, [position, loadPins])
);
```
The comment above this in the file explains why: "Distance drifts as the user
walks, so re-check silently on every visit."

### 3b. API call

`mobile/src/services/api.js`, lines 95–99:

```js
// Returns { pins: [{id, brand_name, description, reward_value, lat, lng,
// distance_m, claimed}], claimRadiusMeters } — every reward pin with live
// distance from the given position.
getRewardPins: (lat, lng) =>
  request(`/api/rewards/pins?lat=${lat}&lng=${lng}`),
```

Plain English: a thin wrapper around `fetch` (the shared `request()` helper
at the top of `api.js` attaches the JWT auth header automatically). This is a
GET request with the coordinates as query params — nothing sensitive here, so
no request body needed.

### 3c. Backend route

`backend/src/routes/rewards.js`, lines 23–50 — `GET /api/rewards/pins`:

```js
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
```

Plain English, step by step:
1. `requireAuth` (a shared Express middleware, see box below) runs first and
   blocks the request entirely if there's no valid JWT.
2. `parseCoords` validates the lat/lng query params are sane numbers within
   real-world ranges — see the validation box further down.
3. It calls the `list_reward_pins_with_distance` **PostGIS function** (Step
   3d) via Supabase's `.rpc()` — this is where the actual distance
   calculation happens, entirely inside the database, not in JavaScript.
4. Separately, it fetches which pins *this specific user* has already
   claimed, by querying `reward_claims` filtered to `req.userId`.
5. It merges the two: every pin gets a `claimed: true/false` flag added
   before being sent back, so the client doesn't need a second request to
   know which pins to grey out / mark claimed.

> **Shared middleware — `requireAuth`.** `backend/src/middleware/auth.js`,
> lines 3–17. Every route in this feature (`/pins` and `/claim`) is wrapped
> with this. It reads the `Authorization: Bearer <token>` header, verifies
> the JWT with `jwt.verify(token, process.env.JWT_SECRET)`, and — if valid —
> attaches the decoded user id as `req.userId` for the rest of the route to
> use. If the header's missing or the token's invalid/expired, it responds
> `401` immediately and the route body never runs. This is how `req.userId`
> shows up "for free" in every handler below without each one re-implementing
> auth.

> **Input validation — `parseCoords`.** `backend/src/routes/rewards.js`,
> lines 10–19:
> ```js
> const LAT_RE = /^-?\d{1,2}(\.\d+)?$/;
> const LNG_RE = /^-?\d{1,3}(\.\d+)?$/;
>
> function parseCoords(query) {
>   const lat = Number(query.lat);
>   const lng = Number(query.lng);
>   if (!LAT_RE.test(String(query.lat ?? '')) || !LNG_RE.test(String(query.lng ?? ''))) return null;
>   if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
>   return { lat, lng };
> }
> ```
> Two checks: a regex shape check (latitude can be at most 2 digits before
> the decimal, longitude at most 3 — matches real-world coordinate ranges),
> then a numeric range check as a second line of defence. Returns `null` on
> anything malformed, which both routes treat as a 400 error. Used by both
> `/pins` (reading from `req.query`) and `/claim` (reading from `req.body`).

### 3d. The PostGIS function that computes distance for the whole pin list

`backend/migrations/005_reward_claims.sql`, lines 51–75:

```sql
create or replace function list_reward_pins_with_distance(
  user_lat double precision,
  user_lng double precision
) returns table (
  id           uuid,
  brand_name   text,
  description  text,
  reward_value int,
  lat          double precision,
  lng          double precision,
  distance_m   double precision
) as $$
  select
    id,
    brand_name,
    description,
    reward_value,
    ST_Y(location) as lat,
    ST_X(location) as lng,
    ST_Distance(
      location::geography,
      ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
    ) as distance_m
  from reward_pins;
$$ language sql stable;
```

Plain English: this is a Postgres function ("RPC" from Supabase's point of
view) that takes the user's lat/lng and returns **every row** in
`reward_pins`, with two extra computed columns:
- `lat`/`lng` — pulled back out of the raw PostGIS `location` geometry column
  using `ST_Y`/`ST_X` (Supabase's JS client can't read the raw PostGIS type
  directly, so this "unpacks" it into plain numbers the client can use).
- `distance_m` — the actual distance calculation. `location::geography` casts
  the stored point to PostGIS's geography type (which does *great-circle*
  distance — i.e. accounts for the Earth being a sphere, not flat), and
  `ST_Distance(...)` returns metres between that and a freshly-built point
  from the user's coordinates.

This runs once and returns distances for all 8 pins in a single round trip —
that's why the map can show every pin's distance without 8 separate requests.

### 3e. Rendering on the map

`mobile/src/screens/MapScreen.js`, lines 144–169:

```js
<MapView
  style={styles.flex}
  customMapStyle={DARK_MAP_STYLE}
  showsUserLocation
  showsMyLocationButton={false}
  initialRegion={{
    latitude: position.latitude,
    longitude: position.longitude,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  }}
>
  {pins.map((pin) => (
    <Marker
      key={pin.id}
      coordinate={{ latitude: pin.lat, longitude: pin.lng }}
      pinColor={pin.claimed ? colors.positive : colors.accent}
      onPress={() => {
        setSelectedPin(pin);
        setFeedback(null);
      }}
    />
  ))}
</MapView>
```

Plain English: `react-native-maps`' `<MapView>` is the actual map widget
(wraps native Apple Maps on iOS / Google Maps on Android).
`showsUserLocation` turns on the native blue dot for the device's live
position. `initialRegion` centres the camera on where the user currently is
when the screen first opens (only used once, not on every re-render).

The `pins.map(...)` loop is the bridge between the data from Step 3c and
what's visually on screen: one `<Marker>` per pin, coloured green
(`colors.positive`) if already claimed or orange (`colors.accent`, the app's
main accent colour) if not. Tapping a marker doesn't call the backend at all
— it just stores that pin object in `selectedPin` state, which is what makes
the claim card (Step 8) appear at the bottom of the screen.

---

## Step 4 — Building and sending the claim request

`mobile/src/screens/MapScreen.js`, lines 95–120 — `handleClaim`:

```js
const handleClaim = useCallback(async () => {
  if (!selectedPin || !position) return;
  setClaiming(true);
  setFeedback(null);
  try {
    const res = await api.claimReward(selectedPin.id, position.latitude, position.longitude);
    setFeedback({
      type: 'success',
      text: res.alreadyClaimed
        ? 'Already claimed'
        : `+${res.pointsAwarded} points from ${res.brandName}!`,
    });
    await loadPins(position);
    setSelectedPin((prev) => (prev ? { ...prev, claimed: true } : prev));
  } catch (err) {
    const distanceMeters = err.data?.distanceMeters;
    setFeedback({
      type: 'error',
      text: distanceMeters != null
        ? `Too far away — ${formatDistance(distanceMeters)}, need to be within ${claimRadius} m`
        : err.message,
    });
  } finally {
    setClaiming(false);
  }
}, [selectedPin, position, loadPins, claimRadius]);
```

Plain English: this fires when the user taps "Claim reward" on the card
(Step 8 shows where that button lives). It's guarded — if there's no
`selectedPin` or no `position` yet, it just returns and does nothing, so it
can't send a malformed request.

It builds the request from **two pieces of state already sitting in the
component**: `selectedPin.id` (which pin — set when the marker was tapped in
Step 3e) and `position.latitude/longitude` (the same GPS fix from Step 2 —
**not re-fetched here**, so the coordinates sent match what's already shown
on screen). This is passed to `api.claimReward`.

`mobile/src/services/api.js`, lines 101–106:

```js
// Throws with err.data.distanceMeters/claimRadiusMeters when out of range.
claimReward: (rewardPinId, lat, lng) =>
  request('/api/rewards/claim', {
    method: 'POST',
    body: JSON.stringify({ reward_pin_id: rewardPinId, lat, lng }),
  }),
```

Plain English: this is a POST (not GET, unlike `/pins`) — it's a request that
*changes* server state, so REST convention and the actual route below both
expect a JSON body rather than query params. The comment documents an
important contract: on failure, the shared `request()` helper (`api.js`,
lines 15–22) attaches the full error response body as `err.data`, which is
exactly what lets `handleClaim`'s `catch` block above pull out
`err.data?.distanceMeters` for the "too far away" message.

---

## Step 5 — Backend receives, validates, and processes the claim

`backend/src/routes/rewards.js`, lines 59–140 — `POST /api/rewards/claim`.
This is the most important function in the whole feature, so it's broken
into its logical sub-steps below, in the order they execute.

### 5a. Input validation

Lines 59–68:
```js
router.post('/claim', requireAuth, async (req, res) => {
  const { reward_pin_id: rewardPinId } = req.body ?? {};
  const coords = parseCoords(req.body ?? {});

  if (typeof rewardPinId !== 'string' || !rewardPinId.trim()) {
    return res.status(400).json({ error: 'reward_pin_id is required' });
  }
  if (!coords) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }
```
Same `requireAuth` and `parseCoords` from Step 3c, just applied to
`req.body` this time instead of `req.query` (`parseCoords` reads whichever
object it's handed). Checks the pin ID is a real non-empty string and the
coordinates parsed successfully before doing anything else.

### 5b. Look up the pin (does it exist?)

Lines 70–81:
```js
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
```
**Error handling — unknown pin:** if someone sends a `reward_pin_id` that
doesn't exist (typo, stale/deleted pin, or a tampered request), this returns
a clean `404` rather than crashing further down. `pin.reward_value` (the
points this pin is worth) is grabbed here because it's needed later for the
points award — one lookup, reused twice.

### 5c. Already-claimed check

Lines 83–94:
```js
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
```
**Error handling — already claimed:** this project's reward pins are
one-time claims *per pin, forever* — not a daily reset. If this user already
has a row in `reward_claims` for this pin, it returns success (`200`, not an
error status) with `alreadyClaimed: true` and no new points awarded. The
route comment above explains why this check exists even though there's also
a database-level unique constraint (Step 6a): "this lookup just avoids an
unnecessary points award attempt" — it's an optimisation/UX nicety, not the
real enforcement mechanism.

### 5d. The PostGIS proximity check itself

Lines 96–110:
```js
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
```
**This is the security-critical step.** `CLAIM_RADIUS_METERS` is defined at
the top of the file (line 8) as `30`. The backend calls the
`reward_pin_distance_meters` PostGIS function — **the exact same kind of
server-side calculation as Step 3d**, just for one pin instead of all of
them:

`backend/migrations/005_reward_claims.sql`, lines 38–49:
```sql
create or replace function reward_pin_distance_meters(
  pin_id  uuid,
  lat     double precision,
  lng     double precision
) returns double precision as $$
  select ST_Distance(
    location::geography,
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
  )
  from reward_pins
  where id = pin_id;
$$ language sql stable;
```
Same `ST_Distance` + geography-cast pattern as before, just scoped to
`where id = pin_id` and returning a single number instead of a table.

**Error handling — out of range:** if that number is bigger than 30, the
request is rejected with `403 Forbidden` and the actual distance is included
in the response body — this is what `handleClaim`'s `catch` block (Step 4)
reads as `err.data.distanceMeters` to build the "Too far away — 247m away,
need to be within 30m" message. The important design point for the review:
**the distance shown on the pin card earlier (from Step 3d) is only ever a
convenience preview — this recalculation is the one that actually gates
whether the claim succeeds**, and it uses the coordinates from *this*
request, not anything cached from the pin list.

---

## Step 6 — What gets written to the database

Once the code reaches here, the user passed every check: valid input, real
pin, not already claimed, within range.

### 6a. Insert the claim row

`backend/src/routes/rewards.js`, lines 112–129:
```js
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
```
Plain English: inserts one row into `reward_claims` recording who claimed
what and how many points it was worth *at claim time* (`points_awarded` is
copied from `pin.reward_value` rather than re-read later, so if a pin's
reward value ever changes in future, past claims still reflect what was
actually awarded).

**Why the `23505` check matters:** the table has a real database constraint
—

`backend/migrations/005_reward_claims.sql`, line 30:
```sql
unique (user_id, reward_pin_id)
```

— so if two requests for the same claim somehow arrive at almost the same
time (e.g. a double-tap), the *database itself* refuses the second insert
with Postgres error code `23505` (unique violation), even though the earlier
"already claimed?" check in step 5c might have raced past it. The code
treats that specific error code as "not really an error" — it just re-fetches
whichever row won and returns `alreadyClaimed: true`, same as the 5c path.
This is the real enforcement the file's top comment refers to: "the unique
constraint is what actually prevents re-claiming a pin, not application
logic alone."

### 6b. Award points (and roll back if that fails)

`backend/src/routes/rewards.js`, lines 131–139:
```js
const { error: pointsError } = await supabase
  .from('points')
  .insert({ user_id: req.userId, amount: pin.reward_value, source: 'gps' });
if (pointsError) {
  await supabase.from('reward_claims').delete().eq('id', claim.id);
  return res.status(500).json({ error: `Failed to award points: ${pointsError.message}` });
}

res.status(201).json({ claim, brandName: pin.brand_name, pointsAwarded: pin.reward_value });
```
Plain English: a second insert, this time into the shared `points` table
(the same table habit completions also write to — `source: 'gps'` is how
this row is distinguished from `source: 'habit'` rows elsewhere in the app).
If this insert fails for any reason, the code **deletes the claim row it
just created** — this stops the two tables from drifting out of sync (a
claim existing with no matching points, or vice versa). This mirrors the
same rollback pattern already used in the habits feature
(`backend/src/routes/habits.js`), for consistency across the codebase.

If everything succeeded, it responds `201 Created` with the claim record,
the brand name, and the points awarded — this is the JSON `handleClaim`
(Step 4) reads as `res.pointsAwarded` / `res.brandName`.

> **Note on streaks:** this claim flow only writes to `points` and
> `reward_claims`. It does **not** touch the `habits` table or trigger any
> streak recalculation — the streak feature (`GET /api/streak`,
> `backend/src/routes/streak.js`) is defined purely in terms of consecutive
> days with at least one **habit** completion. A GPS claim currently
> contributes to the user's points total but not their streak. Worth
> mentioning explicitly in the review since it's an easy thing to assume
> works the other way.

---

## Step 7 — Response summary (all the possible outcomes)

| Situation | HTTP status | Body |
|---|---|---|
| Missing/invalid `reward_pin_id` | 400 | `{ error: 'reward_pin_id is required' }` |
| Missing/invalid lat/lng | 400 | `{ error: 'lat and lng are required' }` |
| Pin doesn't exist | 404 | `{ error: 'Reward pin not found' }` |
| Already claimed (pre-check or DB race) | 200 | `{ claim, alreadyClaimed: true }` |
| Too far away | 403 | `{ error: '...', distanceMeters, claimRadiusMeters }` |
| Any Supabase/DB error | 500 | `{ error: '...' }` |
| Success | 201 | `{ claim, brandName, pointsAwarded }` |

This table is really just Steps 5–6 laid flat — useful to have on hand if
your supervisor asks "what happens if X."

---

## Step 8 — Client updates state/UI after the claim resolves

Back in `handleClaim` (`mobile/src/screens/MapScreen.js`, lines 95–120,
quoted in full in Step 4) — after `api.claimReward` either resolves or
throws:

**On success** (including the `alreadyClaimed: true` case, which the API
layer treats as a normal 200 response, not a thrown error):
```js
setFeedback({
  type: 'success',
  text: res.alreadyClaimed
    ? 'Already claimed'
    : `+${res.pointsAwarded} points from ${res.brandName}!`,
});
await loadPins(position);
setSelectedPin((prev) => (prev ? { ...prev, claimed: true } : prev));
```
Three things happen: a success message is shown on the claim card;
`loadPins` (Step 3a) is called again so the pin list — and therefore every
marker's colour on the map — reflects the new claimed state from the server,
rather than the client guessing; and `selectedPin` is optimistically flagged
`claimed: true` immediately so the card's UI (Step 8's render logic below)
switches to the "Claimed" badge without waiting for `loadPins` to finish.

**On failure:**
```js
const distanceMeters = err.data?.distanceMeters;
setFeedback({
  type: 'error',
  text: distanceMeters != null
    ? `Too far away — ${formatDistance(distanceMeters)}, need to be within ${claimRadius} m`
    : err.message,
});
```
If the error body included `distanceMeters` (the 403 out-of-range case from
Step 5d), it builds a specific, human-readable distance message using
`formatDistance` (`mobile/src/screens/MapScreen.js`, lines 32–35 — formats
metres or kilometres depending on size). Any other error (404, 400, 500)
just falls back to showing `err.message` directly.

`finally { setClaiming(false); }` always runs regardless of outcome, so the
button's spinner (Step 8's render below) never gets stuck on.

**Where this all shows up visually** —
`mobile/src/screens/MapScreen.js`, lines 185–231, the claim card:
```jsx
{selectedPin && (
  <View style={[styles.claimCard, ...]}>
    ...
    <Text style={styles.brandName}>{selectedPin.brand_name}</Text>
    ...
    {feedback && (
      <Text style={[styles.feedbackText, feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError]}>
        {feedback.text}
      </Text>
    )}

    {selectedPin.claimed ? (
      <View style={styles.claimedBadge}>
        <Ionicons name="checkmark-circle" size={18} color={colors.positive} />
        <Text style={styles.claimedText}>Claimed</Text>
      </View>
    ) : (
      <TouchableOpacity style={[styles.claimButton, claiming && styles.claimButtonBusy]} onPress={handleClaim} disabled={claiming}>
        {claiming ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.claimButtonText}>Claim reward</Text>}
      </TouchableOpacity>
    )}
  </View>
)}
```
This card only renders at all when `selectedPin` is set (i.e. a marker was
tapped — Step 3e). It conditionally shows either the "Claim reward" button
(disabled + spinner while `claiming` is true) or, once
`selectedPin.claimed` is true, a green checkmark badge instead — that
`claimed` flag is exactly the one flipped optimistically in the success
handler above, so the button swaps to the badge instantly without a visible
reload.

---

## One-page mental model for the review

```
GPS (expo-location)  +  reward_pins table (seeded)
        │                        │
        ▼                        │
refreshLocation() ─────► loadPins(coords) ─────► GET /api/rewards/pins
  (permission +                                    ├─ parseCoords()
   getCurrentPosition)                              ├─ RPC: list_reward_pins_with_distance (PostGIS)
        │                                           └─ merge in this user's reward_claims
        ▼
 <MapView>/<Marker> renders pins, colour = claimed?
        │
   user taps a pin → selectedPin set → claim card shows
        │
        ▼
handleClaim() ─────► POST /api/rewards/claim
                        ├─ parseCoords() + pin lookup (404 if missing)
                        ├─ already-claimed check (200, alreadyClaimed:true)
                        ├─ RPC: reward_pin_distance_meters (PostGIS)  ◄── real gate, 403 if > 30m
                        ├─ insert reward_claims (unique constraint = real race guard, 23505 → alreadyClaimed)
                        └─ insert points (source:'gps') — rolled back if this fails
                        ▼
                 201 { claim, brandName, pointsAwarded }
        │
        ▼
handleClaim() success handler: feedback text, loadPins() refresh, selectedPin.claimed = true
        │
        ▼
claim card re-renders: "Claim reward" button → green "Claimed" badge
```
