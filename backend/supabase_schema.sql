-- AuraFit Database Schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Requires: PostGIS extension already enabled

-- ────────────────────────────────────────────────────────────
-- TABLES
-- ────────────────────────────────────────────────────────────

create table if not exists users (
  id              uuid primary key default gen_random_uuid(),
  email           text unique not null,
  password_hash   text not null,
  created_at      timestamptz default now()
);

create table if not exists health_inputs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references users(id) on delete cascade,
  sleep_hours         float not null,
  diet_quality        int not null check (diet_quality between 1 and 5),
  exercise_frequency  int not null check (exercise_frequency between 0 and 7),
  stress_level        int not null check (stress_level between 1 and 5),
  created_at          timestamptz default now()
);

create table if not exists predictions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  risk_score  float not null check (risk_score between 0 and 100),
  risk_tier   text not null check (risk_tier in ('low', 'moderate', 'high')),
  created_at  timestamptz default now()
);

create table if not exists habits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  title         text not null,
  completed     boolean default false,
  date          date not null,
  points_value  int not null default 10
);

create table if not exists points (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  amount      int not null,
  source      text not null check (source in ('habit', 'gps')),
  created_at  timestamptz default now()
);

create table if not exists reward_pins (
  id            uuid primary key default gen_random_uuid(),
  brand_name    text not null,
  description   text,
  location      geometry(Point, 4326) not null,
  reward_value  int not null default 50
);

-- ────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────
-- Note: our backend uses the service-role key, which bypasses RLS.
-- RLS policies below protect direct client-side access if ever needed.

alter table users enable row level security;
alter table health_inputs enable row level security;
alter table predictions enable row level security;
alter table habits enable row level security;
alter table points enable row level security;
alter table reward_pins enable row level security;

-- Users: can only read/update their own row
create policy "users: own row only" on users
  for all using (id = auth.uid());

-- Health inputs: own rows only
create policy "health_inputs: own rows" on health_inputs
  for all using (user_id = auth.uid());

-- Predictions: own rows only
create policy "predictions: own rows" on predictions
  for all using (user_id = auth.uid());

-- Habits: own rows only
create policy "habits: own rows" on habits
  for all using (user_id = auth.uid());

-- Points: own rows only
create policy "points: own rows" on points
  for all using (user_id = auth.uid());

-- Reward pins: readable by anyone authenticated, not writable by clients
create policy "reward_pins: authenticated read" on reward_pins
  for select using (auth.role() = 'authenticated');

-- ────────────────────────────────────────────────────────────
-- SPATIAL INDEX for GPS proximity queries (Chunk 4)
-- ────────────────────────────────────────────────────────────
create index if not exists reward_pins_location_idx
  on reward_pins using gist(location);
