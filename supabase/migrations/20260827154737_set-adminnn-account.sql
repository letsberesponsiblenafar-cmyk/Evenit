update public.profiles set username = 'admin', is_admin = true where id in (select id from auth.users where lower(email) = 'adminnn@gmail.com');
