-- 004: monthly AI-generated habit sets (Chunk 3 — Gemini habit generation)
--
-- habit_sets       one row per user per calendar month; holds the Gemini
--                  "why your score looks this way" reasoning text and whether
--                  the set came from Gemini or the hardcoded fallback list
--                  (source — useful evaluation data for the dissertation).
-- habit_set_items  the 5 generated habits belonging to a set.
-- habits           (existing daily-completion table) gains habit_item_id so a
--                  day's completion references the exact generated habit,
--                  instead of matching on free-text title as before.
--
-- Paste into the Supabase SQL editor (same workflow as migrations 002/003).

create table if not exists habit_sets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  month      text not null check (month ~ '^\d{4}-\d{2}$'), -- client-local 'YYYY-MM'
  reasoning  text not null,
  source     text not null default 'gemini' check (source in ('gemini', 'fallback')),
  created_at timestamptz default now(),
  unique (user_id, month)
);

create table if not exists habit_set_items (
  id           uuid primary key default gen_random_uuid(),
  set_id       uuid not null references habit_sets(id) on delete cascade,
  -- denormalised user_id so RLS needs no join and the completion endpoint can
  -- verify ownership in one lookup
  user_id      uuid not null references users(id) on delete cascade,
  title        text not null,
  subtext      text not null,
  points_value int  not null check (points_value between 5 and 100),
  position     int  not null,
  created_at   timestamptz default now()
);

alter table habits
  add column if not exists habit_item_id uuid references habit_set_items(id) on delete set null;

alter table habit_sets enable row level security;
alter table habit_set_items enable row level security;

create policy "habit_sets: own rows" on habit_sets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "habit_set_items: own rows" on habit_set_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
