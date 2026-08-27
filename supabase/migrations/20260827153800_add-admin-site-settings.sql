alter table public.profiles add column if not exists is_admin boolean not null default false;
update public.profiles set is_admin = true where id in (select id from auth.users where lower(email) = 'abhaseeb.org@gmail.com');

create table if not exists public.site_settings (
  id boolean primary key default true check (id = true),
  site_name text not null default 'Evenit',
  primary_color text not null default '#7657e8',
  accent_color text not null default '#c8a56a',
  notification_label text not null default 'Notifications',
  reaction_icon text not null default '👍🏻',
  updated_at timestamptz not null default now()
);
insert into public.site_settings (id) values (true) on conflict (id) do nothing;
alter table public.site_settings enable row level security;
create policy "Public settings are readable" on public.site_settings for select using (true);
create policy "Admins manage site settings" on public.site_settings for update using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)) with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));
create policy "Admins can insert site settings" on public.site_settings for insert with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, full_name, neighborhood, interests, is_admin)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)), new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'neighborhood', array_remove(array[new.raw_user_meta_data->>'interest'], null), lower(new.email) = 'abhaseeb.org@gmail.com');
  return new;
end;
$$;
