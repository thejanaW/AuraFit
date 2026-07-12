-- Migration 003 — health_inputs: Chunk 1 placeholder → full onboarding shape (Chunk 2)
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- WHY: the original Chunk 1 table was a 4-column placeholder (sleep_hours,
-- diet_quality, exercise_frequency, stress_level). The onboarding form now
-- collects the full personalisation field set that Gemini habit generation
-- (Chunk 3) will consume, plus the health-background answers
-- (matches AuraFit_Full_Context.md schema).
--
-- SAFE: no health input feature has shipped before this — the table holds no
-- real rows. If you inserted manual test rows, they will be lost.

drop table if exists health_inputs;

create table health_inputs (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references users(id) on delete cascade,

  -- Personalisation-only fields (feed Gemini habit generation, NOT the ML model)
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

  -- Habits (raw form answers; model receives the BRFSS-coded versions separately)
  alcohol_consumption      text,
  smoking_status           text,

  -- Health background (used for framing/labels only — never model input features)
  existing_heart_condition boolean,
  high_bp_diagnosis        boolean,
  diabetes_diagnosis       boolean,
  general_health_rating    text,

  created_at               timestamptz default now()
);

alter table health_inputs enable row level security;

create policy "health_inputs: own rows" on health_inputs
  for all using (user_id = auth.uid());
