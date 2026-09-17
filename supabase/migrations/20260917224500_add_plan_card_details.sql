-- Separate the short, card-facing tagline from the long event description.
-- Existing plans remain valid; new plans supply both fields through the composer.
alter table public.plans
  add column if not exists tagline text,
  add column if not exists cover_style text not null default 'aurora';

alter table public.plans
  drop constraint if exists plans_tagline_length_check,
  add constraint plans_tagline_length_check
    check (tagline is null or char_length(tagline) between 1 and 120),
  drop constraint if exists plans_cover_style_check,
  add constraint plans_cover_style_check
    check (cover_style in ('aurora', 'coffee', 'outdoors', 'studio'));

insert into storage.buckets (id, name, public)
values ('plan-covers', 'plan-covers', true)
on conflict (id) do update set public = true;

drop policy if exists "Plan covers are public" on storage.objects;
create policy "Plan covers are public"
on storage.objects for select
using (bucket_id = 'plan-covers');

drop policy if exists "Users upload plan covers" on storage.objects;
create policy "Users upload plan covers"
on storage.objects for insert
with check (bucket_id = 'plan-covers' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users update their plan covers" on storage.objects;
create policy "Users update their plan covers"
on storage.objects for update
using (bucket_id = 'plan-covers' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete their plan covers" on storage.objects;
create policy "Users delete their plan covers"
on storage.objects for delete
using (bucket_id = 'plan-covers' and (storage.foldername(name))[1] = auth.uid()::text);

-- Keep the original nine-argument RPC available for older installed clients.
-- New clients use this exact signature and atomically add the card details.
create or replace function public.create_plan_with_question_form(
  p_title text,
  p_location text,
  p_starts_at timestamptz,
  p_caption text,
  p_category text,
  p_requires_college_verification boolean,
  p_questions jsonb,
  p_latitude double precision,
  p_longitude double precision,
  p_tagline text,
  p_image_url text,
  p_cover_style text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_cover_style text := coalesce(nullif(trim(p_cover_style), ''), 'aurora');
  v_tagline text := nullif(trim(coalesce(p_tagline, '')), '');
begin
  if v_tagline is null then
    raise exception 'Add a short event tagline for the home card.';
  end if;
  if char_length(v_tagline) > 120 then
    raise exception 'Keep the event tagline to 120 characters or fewer.';
  end if;
  if v_cover_style not in ('aurora', 'coffee', 'outdoors', 'studio') then
    raise exception 'Choose one of the available plan covers.';
  end if;

  v_plan_id := public.create_plan_with_question_form(
    p_title, p_location, p_starts_at, p_caption, p_category,
    p_requires_college_verification, p_questions, p_latitude, p_longitude
  );

  update public.plans
  set tagline = v_tagline,
      image_url = nullif(trim(coalesce(p_image_url, '')), ''),
      cover_style = v_cover_style
  where id = v_plan_id;

  return v_plan_id;
end;
$$;

revoke all on function public.create_plan_with_question_form(text, text, timestamptz, text, text, boolean, jsonb, double precision, double precision, text, text, text) from public;
grant execute on function public.create_plan_with_question_form(text, text, timestamptz, text, text, boolean, jsonb, double precision, double precision, text, text, text) to authenticated;
