-- Allow owners to delete their own plans
drop policy if exists "Owners delete plans" on public.plans;
create policy "Owners delete plans" on public.plans for delete using (auth.uid() = user_id);

-- Cleanup test-generated plans (host scan / full attended) created during QA
delete from public.plans where title ilike 'Host Scan%' or title ilike 'Full Attended%';
