-- Migration 002 — predictions table: single-score → multi-label shape (Chunk 2)
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- WHY: the original Chunk 1 table stored one combined risk_score + risk_tier.
-- Chunk 2 switched to a multi-label ML design: the model returns a separate
-- risk probability per condition plus an overall 0-100 health score, so the
-- table needs per-condition columns (matches AuraFit_Full_Context.md schema).
--
-- SAFE: verified the predictions table holds 0 rows (no prediction feature
-- existed before this), so drop-and-recreate loses nothing.

drop table if exists predictions;

create table predictions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references users(id) on delete cascade,
  predicted_health_score  float not null check (predicted_health_score between 0 and 100),
  -- Raw model probabilities per condition (class-balance inflated —
  -- for UI display use risk_breakdown bands, not these raw values)
  heart_attack_risk       float not null check (heart_attack_risk between 0 and 1),
  heart_disease_risk      float not null check (heart_disease_risk between 0 and 1),
  diabetes_risk           float not null check (diabetes_risk between 0 and 1),
  high_bp_risk            float not null check (high_bp_risk between 0 and 1),
  -- Band labels as returned by the ML service, e.g.
  -- {"heart_attack": "Low", "heart_disease": "Low", "diabetes": "Moderate", "high_bp": "High"}
  risk_breakdown          jsonb not null,
  created_at              timestamptz default now()
);

alter table predictions enable row level security;

create policy "predictions: own rows" on predictions
  for all using (user_id = auth.uid());
