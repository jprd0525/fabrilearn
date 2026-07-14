-- ForensiLearn — P3c: helper for the invite edge function.
-- Resolves an email to a user id (reads auth.users, so SECURITY DEFINER). Service-role use only.
-- Run after policies-p3b-memberships.sql.

create or replace function public.uid_for_email(p_email text) returns uuid
  language sql security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

-- Keep it off-limits to ordinary users (prevents email enumeration); the edge function
-- calls it with the service role, which is unaffected by this revoke.
revoke all on function public.uid_for_email(text) from public, anon, authenticated;
