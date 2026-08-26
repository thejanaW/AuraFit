-- 008: redeemable coupon codes on claimed_coupons
--
-- Adds a `code` to each CLAIM (not to `coupons` itself — the coupon per pin
-- is still fixed/shared, see 007, but the redemption code is per-claim, so
-- two different users claiming the same pin get two different codes). The
-- claim endpoint generates + stores it in JS (rewards.js) and returns it in
-- the response; GET /api/rewards/coupons reads the same stored value back —
-- so the code shown at claim time on the Map tab and the code shown later
-- on Profile -> My Coupons are guaranteed to be identical, not regenerated.
--
-- Paste into the Supabase SQL editor (same workflow as migrations 002-007).
-- Backfills any pre-existing claimed_coupons rows (from before this
-- migration) with a one-off SQL-generated code so the later NOT NULL +
-- UNIQUE constraints can be added safely.

alter table claimed_coupons add column if not exists code text;

update claimed_coupons
set code = 'AURA-' || upper(substr(md5(random()::text || id::text), 1, 6))
where code is null;

alter table claimed_coupons alter column code set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'claimed_coupons_code_key'
  ) then
    alter table claimed_coupons add constraint claimed_coupons_code_key unique (code);
  end if;
end $$;
