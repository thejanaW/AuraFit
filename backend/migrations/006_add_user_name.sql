-- 006: add a display name to users
--
-- nullable because existing rows (registered before this migration) have
-- no name on record — Home/Profile fall back to deriving one from the email
-- prefix for those users. New registrations collect and store it going forward.

alter table users add column if not exists name text;
