alter table public.profiles add column if not exists college text;
alter table public.profiles add column if not exists enrollment_id text;
alter table public.profiles add column if not exists education_public boolean not null default false;
