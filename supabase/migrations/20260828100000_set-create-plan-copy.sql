update public.site_settings
set content = jsonb_set(
  jsonb_set(content, '{post_button}', to_jsonb('Create plan'::text), true),
  '{create_event_button}',
  to_jsonb('Create plan'::text),
  true
), updated_at = now()
where id = true;
