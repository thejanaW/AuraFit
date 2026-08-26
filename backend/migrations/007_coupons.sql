-- 007: reward-claim coupon reveal
--
-- coupons          ONE fixed coupon per reward_pin (unique reward_pin_id) —
--                   not a random cross-brand pool. Claiming a pin always
--                   reveals that pin's own specific coupon, e.g. Healers
--                   Juice Bar -> "20% off your next purchase" every time.
--                   Deliberately separate from reward_pins.description
--                   (the pre-claim teaser shown on the map pin card) — this
--                   is the post-claim reveal shown in the reward modal.
-- claimed_coupons   history log: which coupon a user got from which claim.
--                   Not required for the claim flow itself (the response
--                   payload carries the coupon directly) — exists so a
--                   future "My Coupons" screen has something to read from.
--
-- No RPC needed here (unlike 005's PostGIS functions) — a fixed per-pin
-- coupon is just `select ... where reward_pin_id = $1`, which the Supabase
-- JS query builder already expresses safely on its own.
--
-- Paste into the Supabase SQL editor (same workflow as migrations 002-006).
-- Seed data at the bottom — one coupon per each of the 8 reward_pins seeded
-- in 005. DUMMY for demo purposes only, same disclaimer as 005: no real
-- partnership/discount agreements exist with these businesses.

create table if not exists coupons (
  id             uuid primary key default gen_random_uuid(),
  reward_pin_id  uuid not null unique references reward_pins(id) on delete cascade,
  brand_name     text not null,
  description    text not null,
  discount_value text not null,
  created_at     timestamptz default now()
);

create table if not exists claimed_coupons (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  coupon_id      uuid not null references coupons(id) on delete cascade,
  reward_pin_id  uuid not null references reward_pins(id) on delete cascade,
  claimed_at     timestamptz default now()
);

alter table coupons enable row level security;
alter table claimed_coupons enable row level security;

-- drop-then-create makes this whole file safe to paste more than once (e.g.
-- after a partial failure like the ambiguous-column bug the insert below
-- originally had) — `create policy` has no `if not exists` form itself.

-- Coupons: readable by anyone authenticated, not writable by clients —
-- same shape as "reward_pins: authenticated read" in supabase_schema.sql.
drop policy if exists "coupons: authenticated read" on coupons;
create policy "coupons: authenticated read" on coupons
  for select using (auth.role() = 'authenticated');

-- Claimed coupons: own rows only — same shape as "reward_claims: own rows".
drop policy if exists "claimed_coupons: own rows" on claimed_coupons;
create policy "claimed_coupons: own rows" on claimed_coupons
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- SEED DATA — one coupon per existing reward_pin (demo only, no real
-- partnerships). Looked up by brand_name since reward_pins' ids were
-- generated at insert time in migration 005, not known ahead of time here.
-- ────────────────────────────────────────────────────────────
insert into coupons (reward_pin_id, brand_name, description, discount_value)
select reward_pins.id, reward_pins.brand_name, coupon.description, coupon.discount_value
from reward_pins
join (values
  ('Oxygen Fitness Center',           '10% off your next gym session',        '10%'),
  ('The Core Fitness',                'One free personal training session',   'Free session'),
  ('Iron Bull Fitness Arena',         '20% off a monthly membership',         '20%'),
  ('Healers Juice Bar',               '20% off your next purchase',           '20%'),
  ('RAW Organic Handcrafted Juices',  'Buy one juice, get one 50% off',       'BOGO 50%'),
  ('Thinethsa Pharmacy Moratuwa',     '10% off your next purchase',           '10%'),
  ('Happy Health Pharmacy',           '5% off vitamins & supplements',        '5%'),
  ('Pro Player''s Sports',            '15% off sportswear',                   '15%')
) as coupon(brand_name, description, discount_value)
  on coupon.brand_name = reward_pins.brand_name
on conflict (reward_pin_id) do nothing;
