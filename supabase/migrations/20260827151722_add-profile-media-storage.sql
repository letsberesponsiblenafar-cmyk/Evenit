alter table public.profiles add column if not exists banner_url text;
insert into storage.buckets (id, name, public) values ('profile-media', 'profile-media', true) on conflict (id) do update set public = true;
create policy "Profile media is public" on storage.objects for select using (bucket_id = 'profile-media');
create policy "Users upload their profile media" on storage.objects for insert with check (bucket_id = 'profile-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users update their profile media" on storage.objects for update using (bucket_id = 'profile-media' and (storage.foldername(name))[1] = auth.uid()::text);
