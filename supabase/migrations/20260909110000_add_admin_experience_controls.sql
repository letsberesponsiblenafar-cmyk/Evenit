alter table public.site_settings
  add column if not exists experience jsonb not null default '{}'::jsonb;

comment on column public.site_settings.experience is
  'Admin-managed public branding, navigation, header and footer presentation controls.';
