create or replace function public.current_user_is_admin()
returns boolean
language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  );
$$;
revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to anon, authenticated;

drop policy if exists "Users read their own profile" on public.profiles;
create policy "Users read their own profile" on public.profiles for select using (
  auth.uid() = id or public.current_user_is_admin()
);
