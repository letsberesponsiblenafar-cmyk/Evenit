-- The two-step composer offers a richer set of abstract cover moods.
alter table public.plans
  drop constraint if exists plans_cover_style_check,
  add constraint plans_cover_style_check
    check (cover_style in (
      'aurora', 'coffee', 'outdoors', 'studio', 'sunset', 'ocean',
      'citrus', 'midnight', 'bloom', 'paper', 'ember', 'mono'
    ));

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
  if v_cover_style not in (
    'aurora', 'coffee', 'outdoors', 'studio', 'sunset', 'ocean',
    'citrus', 'midnight', 'bloom', 'paper', 'ember', 'mono'
  ) then
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
