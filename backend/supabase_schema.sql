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

-- Expanded shape (migration 003): full onboarding personalisation field set
-- (feeds Gemini habit generation in Chunk 3) plus health-background answers.
create table if not exists health_inputs (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references users(id) on delete cascade,
  sleep_hours              float check (sleep_hours between 0 and 24),
  sleep_quality            int check (sleep_quality between 1 and 5),      -- 1=Restless … 5=Deep (Figma step 2 scale)
  diet_type                text,
  meals_per_day            int check (meals_per_day between 1 and 10),
  water_intake             int check (water_intake between 0 and 30),      -- glasses/day
  exercise_frequency       text,                                           -- categorical key from the form
  exercise_types           text[],
  stress_level             int check (stress_level between 1 and 10),
  work_hours               float check (work_hours between 0 and 24),
  screen_time              float check (screen_time between 0 and 24),
  alcohol_consumption      text,
  smoking_status           text,
  existing_heart_condition boolean,
  high_bp_diagnosis        boolean,
  diabetes_diagnosis       boolean,
  general_health_rating    text,
  created_at               timestamptz default now()
);

-- Multi-label shape (migration 002): one row per prediction run, with the
-- overall score, a raw probability per condition, and the band labels JSON.
create table if not exists predictions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references users(id) on delete cascade,
  predicted_health_score  float not null check (predicted_health_score between 0 and 100),
  heart_attack_risk       float not null check (heart_attack_risk between 0 and 1),
  heart_disease_risk      float not null check (heart_disease_risk between 0 and 1),
  diabetes_risk           float not null check (diabetes_risk between 0 and 1),
  high_bp_risk            float not null check (high_bp_risk between 0 and 1),
  risk_breakdown          jsonb not null,
  created_at              timestamptz default now()
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
