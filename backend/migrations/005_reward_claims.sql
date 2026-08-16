-- 005: GPS reward claims (Chunk 4 — Reward Map)
--
-- reward_claims                one row per user per reward_pin ever claimed;
--                              the unique constraint is what actually prevents
--                              re-claiming a pin, not application logic alone.
-- reward_pin_distance_meters   scalar RPC: great-circle distance in metres
--                              from an arbitrary (lat,lng) to one pin, using
--                              PostGIS geography casts. Used by the claim
--                              endpoint's proximity check.
-- list_reward_pins_with_distance  table RPC: every reward_pins row with its
--                              location unpacked to plain lat/lng (Supabase's
--                              client can't read the raw `geometry` type) plus
--                              distance_m from the caller's position, for the
--                              map screen.
--
-- Paste into the Supabase SQL editor (same workflow as migrations 002/003/004).
-- Seed data at the bottom — 8 real health/fitness-themed businesses in the
-- Colombo/Moratuwa area (Sri Lanka), coordinates pulled from mapping data
-- (not personally surveyed, but real named businesses at real locations,
-- meaningfully more accurate than the earlier generic-landmark placeholders).
-- Reward descriptions ("10% off a day pass" etc.) are PLACEHOLDER terms only
-- — no real partnership/discount agreements exist with these businesses yet.

create table if not exists reward_claims (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  reward_pin_id  uuid not null references reward_pins(id) on delete cascade,
  points_awarded int  not null,
  claimed_at     timestamptz default now(),
  unique (user_id, reward_pin_id)
);

alter table reward_claims enable row level security;

create policy "reward_claims: own rows" on reward_claims
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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

-- ────────────────────────────────────────────────────────────
-- SEED DATA — 8 real health/fitness-themed businesses (Colombo/Moratuwa area)
-- ────────────────────────────────────────────────────────────
-- brand_name has no natural uniqueness constraint from earlier migrations;
-- added here so this insert is safe to re-run (e.g. if 005 is pasted twice).
-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, hence the guarded DO block.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reward_pins_brand_name_key'
  ) then
    alter table reward_pins add constraint reward_pins_brand_name_key unique (brand_name);
  end if;
end $$;

insert into reward_pins (brand_name, description, location, reward_value) values
  ('Oxygen Fitness Center',                'Gym — 10% off a day pass (placeholder reward)',           ST_SetSRID(ST_MakePoint(79.884835, 6.786804), 4326), 30),
  ('The Core Fitness',                     'Gym — 10% off a day pass (placeholder reward)',           ST_SetSRID(ST_MakePoint(79.883523, 6.767523), 4326), 30),
  ('Iron Bull Fitness Arena',              'Gym — 10% off a day pass (placeholder reward)',           ST_SetSRID(ST_MakePoint(79.885478, 6.784661), 4326), 30),
  ('Healers Juice Bar',                    'Juice bar — free small juice (placeholder reward)',       ST_SetSRID(ST_MakePoint(79.887954, 6.794910), 4326), 20),
  ('RAW Organic Handcrafted Juices',       'Juice bar — free small juice (placeholder reward)',       ST_SetSRID(ST_MakePoint(79.891788, 6.858496), 4326), 20),
  ('Thinethsa Pharmacy Moratuwa',          'Pharmacy — 5% off health products (placeholder reward)',  ST_SetSRID(ST_MakePoint(79.883304, 6.771052), 4326), 15),
  ('Happy Health Pharmacy',                'Pharmacy — 5% off health products (placeholder reward)',  ST_SetSRID(ST_MakePoint(79.903043, 6.794990), 4326), 15),
  ('Pro Player''s Sports',                 'Sports store — 10% off sportswear (placeholder reward)',  ST_SetSRID(ST_MakePoint(79.888734, 6.797569), 4326), 25)
on conflict do nothing;
