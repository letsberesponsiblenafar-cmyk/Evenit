create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, full_name, neighborhood, interests)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)), new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'neighborhood', array_remove(array[new.raw_user_meta_data->>'interest'], null));
  return new;
end;
$$;
