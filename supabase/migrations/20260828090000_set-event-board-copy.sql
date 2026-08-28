update public.site_settings
set content = jsonb_set(
  jsonb_set(content, '{home_title}', to_jsonb('The plan board'::text), true),
  '{home_story_label}',
  to_jsonb('Put something on the board'::text),
  true
), updated_at = now()
where id = true;
