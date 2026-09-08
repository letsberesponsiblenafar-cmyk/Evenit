do $$
declare target_table text;
begin
  foreach target_table in array array['plans', 'notifications', 'direct_messages', 'plan_aftermath_posts', 'group_messages']
  loop
    if to_regclass('public.' || target_table) is not null and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end;
$$;
