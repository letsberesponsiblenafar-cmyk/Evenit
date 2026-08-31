-- Seed: fake profiles, upcoming events, past events with aftermath
-- These bypass RLS because migration runs as superuser

-- 1. Create auth users (trigger auto-creates profiles)
-- Use gen_random_uuid() for IDs, but we need fixed IDs for FK refs below.
-- So we'll create profiles manually and skip the trigger by using specific UUIDs.

-- First, disable the trigger temporarily to avoid duplicate profile inserts
drop trigger if exists on_auth_user_created on auth.users;

-- Create auth users with fixed UUIDs
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('a1000000-0000-0000-0000-000000000001', 'maya@test.com', crypt('fakepass123', gen_salt('bf')), now(), '{"username":"maya.waves","full_name":"Maya Chen","neighborhood":"Brooklyn"}'::jsonb, now() - interval '30 days', now() - interval '30 days'),
  ('a1000000-0000-0000-0000-000000000002', 'jordan@test.com', crypt('fakepass123', gen_salt('bf')), now(), '{"username":"jordan.beats","full_name":"Jordan Rivera","neighborhood":"Manhattan"}'::jsonb, now() - interval '25 days', now() - interval '25 days'),
  ('a1000000-0000-0000-0000-000000000003', 'priya@test.com', crypt('fakepass123', gen_salt('bf')), now(), '{"username":"priya.creates","full_name":"Priya Sharma","neighborhood":"Williamsburg"}'::jsonb, now() - interval '20 days', now() - interval '20 days'),
  ('a1000000-0000-0000-0000-000000000004', 'alex@test.com', crypt('fakepass123', gen_salt('bf')), now(), '{"username":"alex.outdoors","full_name":"Alex Kim","neighborhood":"Astoria"}'::jsonb, now() - interval '15 days', now() - interval '15 days'),
  ('a1000000-0000-0000-0000-000000000005', 'sofia@test.com', crypt('fakepass123', gen_salt('bf')), now(), '{"username":"sofia.foodie","full_name":"Sofia Martinez","neighborhood":"Chelsea"}'::jsonb, now() - interval '10 days', now() - interval '10 days'),
  ('a1000000-0000-0000-0000-000000000006', 'kai@test.com', crypt('fakepass123', gen_salt('bf')), now(), '{"username":"kai.zen","full_name":"Kai Tanaka","neighborhood":"SoHo"}'::jsonb, now() - interval '5 days', now() - interval '5 days')
on conflict (id) do nothing;

-- Re-create the trigger for future real users
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- 2. Create profiles (in case trigger didn't fire for existing users)
insert into public.profiles (id, username, full_name, neighborhood, avatar_url)
values
  ('a1000000-0000-0000-0000-000000000001', 'maya.waves', 'Maya Chen', 'Brooklyn', 'https://i.pravatar.cc/160?img=47'),
  ('a1000000-0000-0000-0000-000000000002', 'jordan.beats', 'Jordan Rivera', 'Manhattan', 'https://i.pravatar.cc/160?img=68'),
  ('a1000000-0000-0000-0000-000000000003', 'priya.creates', 'Priya Sharma', 'Williamsburg', 'https://i.pravatar.cc/160?img=32'),
  ('a1000000-0000-0000-0000-000000000004', 'alex.outdoors', 'Alex Kim', 'Astoria', 'https://i.pravatar.cc/160?img=52'),
  ('a1000000-0000-0000-0000-000000000005', 'sofia.foodie', 'Sofia Martinez', 'Chelsea', 'https://i.pravatar.cc/160?img=44'),
  ('a1000000-0000-0000-0000-000000000006', 'kai.zen', 'Kai Tanaka', 'SoHo', 'https://i.pravatar.cc/160?img=12')
on conflict (id) do update set
  username = excluded.username,
  full_name = excluded.full_name,
  neighborhood = excluded.neighborhood,
  avatar_url = excluded.avatar_url;

-- 3. Create UPCOMING events (for Discover swipe deck)
insert into public.plans (id, user_id, title, location, starts_at, caption, category, capacity, neighborhood, created_at)
values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Golden Hour Rooftop Hang', 'The Rooftop at Pier 17, Manhattan', now() + interval '3 days', 'Sunset views, good music, better company. Bring a blanket and your favorite snack. We will be on the rooftop watching the sun go down over the East River.', 'Outdoors', 20, 'Manhattan', now() - interval '2 days'),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'Underground Jazz Night', 'Smalls Jazz Club, West Village', now() + interval '5 days', 'Intimate jazz session in the basement. No phones, just vibes. First drink is on me if you show up before 9pm.', 'Music', 15, 'West Village', now() - interval '3 days'),
  ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 'Zine-Making Workshop', 'Brooklyn Art Library, Williamsburg', now() + interval '7 days', 'We are making tiny zines together. All materials provided. No experience needed — just bring your stories and a willingness to get a little messy with ink.', 'Creative', 12, 'Williamsburg', now() - interval '4 days'),
  ('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000004', 'Sunrise Kayaking on the Hudson', 'Pier 84, Hudson River Park', now() + interval '4 days', 'Early morning kayaking while the city is still waking up. Kayaks and life vests provided. Meet at the dock at 6:30am sharp.', 'Outdoors', 8, 'Hell''s Kitchen', now() - interval '1 day'),
  ('b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000005', 'Sunday Supper Club', 'Community Kitchen, Chelsea Market', now() + interval '6 days', 'Cooking together, eating together. This week we are making handmade pasta from scratch. Ingredients covered, just bring your appetite.', 'Food & Drink', 10, 'Chelsea', now() - interval '2 days'),
  ('b1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000006', 'Morning Meditation & Matcha', 'Tompkins Square Park, East Village', now() + interval '2 days', '20 minutes of guided meditation followed by ceremonial matcha in the park. All levels welcome. Mats provided or bring your own.', 'Wellness', 15, 'East Village', now() - interval '12 hours')
on conflict (id) do nothing;

-- Add some members to upcoming events
insert into public.plan_members (plan_id, user_id, status, created_at)
values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'confirmed', now() - interval '1 day'),
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004', 'confirmed', now() - interval '1 day'),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'confirmed', now() - interval '2 days'),
  ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000005', 'confirmed', now() - interval '3 days'),
  ('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000006', 'confirmed', now() - interval '12 hours'),
  ('b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 'confirmed', now() - interval '1 day'),
  ('b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000006', 'confirmed', now() - interval '1 day'),
  ('b1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000002', 'confirmed', now() - interval '6 hours')
on conflict do nothing;

-- 4. Create PAST events (for aftermath feed)
insert into public.plans (id, user_id, title, location, starts_at, caption, category, capacity, neighborhood, created_at)
values
  ('b2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Late Night Film Screening', 'Nitehawk Cinema, Williamsburg', now() - interval '10 days', 'We watched three short films and talked about independent cinema until 2am. The popcorn was free and the conversation was better.', 'Creative', 18, 'Williamsburg', now() - interval '20 days'),
  ('b2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'Sunset Boat Party', 'Pier 25, Tribeca', now() - interval '7 days', 'Sunset views from the water with 40 people. Live DJ set, rooftop deck, and the skyline at golden hour. One of those nights you remember.', 'Social', 40, 'Tribeca', now() - interval '18 days'),
  ('b2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 'Pottery Workshop', 'Clay Space, Bushwick', now() - interval '5 days', 'Hands in clay, minds off everything else. Everyone made a bowl they were proud of. The studio smelled like earth and possibility.', 'Creative', 10, 'Bushwick', now() - interval '14 days'),
  ('b2000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000004', 'Brooklyn Bridge Bike Ride', 'City Hall Park, Manhattan', now() - interval '14 days', 'Forty bikes crossing the bridge at sunrise. The light on the water was unreal. We ended with bagels in Dumbo.', 'Outdoors', 40, 'Dumbo', now() - interval '25 days'),
  ('b2000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000005', 'Cider Tasting Night', 'The Flatiron Room, Flatiron', now() - interval '3 days', 'Tasted eight different ciders from upstate New York farms. Learned more about fermentation than expected. Left with two bottles.', 'Food & Drink', 12, 'Flatiron', now() - interval '12 days'),
  ('b2000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000006', 'Parkour & Free Running Meetup', 'Domino Park, Williamsburg', now() - interval '8 days', 'First-timers and pros training together. Nobody got hurt, everyone got better. The parkour community in this city is incredible.', 'Sports', 20, 'Williamsburg', now() - interval '16 days')
on conflict (id) do nothing;

-- Add members to past events
insert into public.plan_members (plan_id, user_id, status, created_at)
values
  ('b2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'confirmed', now() - interval '19 days'),
  ('b2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005', 'confirmed', now() - interval '19 days'),
  ('b2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'confirmed', now() - interval '17 days'),
  ('b2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000004', 'confirmed', now() - interval '17 days'),
  ('b2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000006', 'confirmed', now() - interval '17 days'),
  ('b2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000004', 'confirmed', now() - interval '13 days'),
  ('b2000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000002', 'confirmed', now() - interval '24 days'),
  ('b2000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000006', 'confirmed', now() - interval '24 days'),
  ('b2000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 'confirmed', now() - interval '11 days'),
  ('b2000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000004', 'confirmed', now() - interval '11 days'),
  ('b2000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000003', 'confirmed', now() - interval '15 days'),
  ('b2000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000005', 'confirmed', now() - interval '15 days')
on conflict do nothing;

-- 5. Create entry passes for past event attendees (so user_lived_plan works)
insert into public.plan_entry_passes (plan_id, user_id, entry_token, checked_in_at, issued_at)
values
  ('b2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', encode(gen_random_bytes(16),'hex'), now() - interval '10 days', now() - interval '19 days'),
  ('b2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', encode(gen_random_bytes(16),'hex'), now() - interval '10 days', now() - interval '19 days'),
  ('b2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005', encode(gen_random_bytes(16),'hex'), now() - interval '10 days', now() - interval '19 days'),
  ('b2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', encode(gen_random_bytes(16),'hex'), now() - interval '7 days', now() - interval '17 days'),
  ('b2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', encode(gen_random_bytes(16),'hex'), now() - interval '7 days', now() - interval '17 days'),
  ('b2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000004', encode(gen_random_bytes(16),'hex'), now() - interval '7 days', now() - interval '17 days'),
  ('b2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000006', encode(gen_random_bytes(16),'hex'), now() - interval '7 days', now() - interval '17 days'),
  ('b2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', encode(gen_random_bytes(16),'hex'), now() - interval '5 days', now() - interval '13 days'),
  ('b2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000004', encode(gen_random_bytes(16),'hex'), now() - interval '5 days', now() - interval '13 days'),
  ('b2000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000004', encode(gen_random_bytes(16),'hex'), now() - interval '14 days', now() - interval '24 days'),
  ('b2000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000002', encode(gen_random_bytes(16),'hex'), now() - interval '14 days', now() - interval '24 days'),
  ('b2000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000006', encode(gen_random_bytes(16),'hex'), now() - interval '14 days', now() - interval '24 days'),
  ('b2000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000005', encode(gen_random_bytes(16),'hex'), now() - interval '3 days', now() - interval '11 days'),
  ('b2000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', encode(gen_random_bytes(16),'hex'), now() - interval '3 days', now() - interval '11 days'),
  ('b2000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000004', encode(gen_random_bytes(16),'hex'), now() - interval '3 days', now() - interval '11 days'),
  ('b2000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000006', encode(gen_random_bytes(16),'hex'), now() - interval '8 days', now() - interval '15 days'),
  ('b2000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000003', encode(gen_random_bytes(16),'hex'), now() - interval '8 days', now() - interval '15 days'),
  ('b2000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000005', encode(gen_random_bytes(16),'hex'), now() - interval '8 days', now() - interval '15 days')
on conflict do nothing;

-- 6. Create aftermath posts for past events
insert into public.plan_aftermath_posts (plan_id, author_id, body, hashtags, created_at)
values
  -- Film Screening aftermath
  ('b2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
   'The short film marathon was everything. Three films, zero filler. We stayed until closing talking about what independent cinema means in 2026. The Q&A with the filmmaker was the highlight — raw, honest, no PR training.',
   ARRAY['indycinema','filmnight','brooklyn','lateshows'],
   now() - interval '9 days'),
  ('b2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003',
   'My first film screening event and I am already planning the next one. The energy in that theater was different — people actually watching, not scrolling. We need more of this.',
   ARRAY['film','community','nyc','screenings'],
   now() - interval '8 days'),

  -- Boat Party aftermath
  ('b2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002',
   'Sunset from the water hits different when you are surrounded by the right people. The DJ had the city on a vibe. Forty strangers became friends in three hours. Already planning the next one.',
   ARRAY['sunset','boatparty','nyc','summer','goldenhour'],
   now() - interval '6 days'),
  ('b2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000006',
   'That boat party was the best night of the month. The skyline at golden hour, the music, the people. Someone brought a guitar and we all sang together. Pure magic.',
   ARRAY['goldenhour','community','tribeca','music'],
   now() - interval '5 days'),

  -- Pottery Workshop aftermath
  ('b2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003',
   'Hands in clay, mind off everything. I made a bowl that is lumpy and imperfect and I love it. There is something about creating with your hands that screens cannot replicate.',
   ARRAY['pottery','craft','handmade','bushwick','maker'],
   now() - interval '4 days'),

  -- Bike Ride aftermath
  ('b2000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000004',
   'Forty bikes on the Brooklyn Bridge at sunrise. The light on the water, the wind in your hair, the sound of wheels on the bridge. We ended with bagels in Dumbo and it was perfect.',
   ARRAY['biking','sunrise','brooklynbridge','outdoors','nyc'],
   now() - interval '13 days'),
  ('b2000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000002',
   'Best morning ride I have ever done. The bridge was almost empty at that hour. Watching the sun come up over Manhattan while biking is a core memory now.',
   ARRAY['biking','sunrise','corememory','outdoors'],
   now() - interval '12 days'),

  -- Cider Tasting aftermath
  ('b2000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000005',
   'Eight ciders from upstate farms. Learned more about fermentation in one night than I expected. The Honeycrisp rosé cider was unreal. Left with two bottles and a new appreciation for local orchards.',
   ARRAY['cider','tasting','upstate','foodie','fallvibes'],
   now() - interval '2 days'),
  ('b2000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001',
   'The cider night was exactly what I needed. Warm drinks, warm people, zero pretension. The flatiron room was the perfect venue. Already asking when the next one is.',
   ARRAY['cider','cozy','flatiron','drinks','community'],
   now() - interval '1 days'),

  -- Parkour Meetup aftermath
  ('b2000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000006',
   'First timers landing their first precision jump. Pros sharing tips without ego. The parkour community in NYC is something special. Domino Park was the perfect playground.',
   ARRAY['parkour','freerunning','training','williamsburg','community'],
   now() - interval '7 days'),
  ('b2000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000003',
   'I was nervous to try parkour but everyone was so welcoming. Landed my first cat-to-cat by the end of the session. The community energy was electric.',
   ARRAY['parkour','firsttime','bravery','nyc','movement'],
   now() - interval '6 days')
on conflict do nothing;

-- 7. Add some likes to aftermath posts
insert into public.plan_aftermath_likes (post_id, user_id)
select p.id, 'a1000000-0000-0000-0000-000000000002'
from public.plan_aftermath_posts p
where p.plan_id = 'b2000000-0000-0000-0000-000000000001'
on conflict do nothing;

insert into public.plan_aftermath_likes (post_id, user_id)
select p.id, 'a1000000-0000-0000-0000-000000000004'
from public.plan_aftermath_posts p
where p.plan_id = 'b2000000-0000-0000-0000-000000000002'
on conflict do nothing;

insert into public.plan_aftermath_likes (post_id, user_id)
select p.id, 'a1000000-0000-0000-0000-000000000005'
from public.plan_aftermath_posts p
where p.plan_id = 'b2000000-0000-0000-0000-000000000003'
on conflict do nothing;

insert into public.plan_aftermath_likes (post_id, user_id)
select p.id, 'a1000000-0000-0000-0000-000000000003'
from public.plan_aftermath_posts p
where p.plan_id = 'b2000000-0000-0000-0000-000000000004'
on conflict do nothing;

insert into public.plan_aftermath_likes (post_id, user_id)
select p.id, 'a1000000-0000-0000-0000-000000000006'
from public.plan_aftermath_posts p
where p.plan_id = 'b2000000-0000-0000-0000-000000000005'
on conflict do nothing;

insert into public.plan_aftermath_likes (post_id, user_id)
select p.id, 'a1000000-0000-0000-0000-000000000001'
from public.plan_aftermath_posts p
where p.plan_id = 'b2000000-0000-0000-0000-000000000006'
on conflict do nothing;

-- 8. Add some comments to aftermath posts
insert into public.plan_aftermath_comments (post_id, user_id, body, created_at)
values
  ((select id from public.plan_aftermath_posts where plan_id='b2000000-0000-0000-0000-000000000001' limit 1), 'a1000000-0000-0000-0000-000000000004', 'Need to know when the next screening is. I will bring friends.', now() - interval '8 days'),
  ((select id from public.plan_aftermath_posts where plan_id='b2000000-0000-0000-0000-000000000002' limit 1), 'a1000000-0000-0000-0000-000000000003', 'That sunset was genuinely one of the most beautiful things I have seen in this city.', now() - interval '5 days'),
  ((select id from public.plan_aftermath_posts where plan_id='b2000000-0000-0000-0000-000000000004' limit 1), 'a1000000-0000-0000-0000-000000000005', 'The bagel stop at the end was the perfect touch. Best morning in months.', now() - interval '11 days'),
  ((select id from public.plan_aftermath_posts where plan_id='b2000000-0000-0000-0000-000000000005' limit 1), 'a1000000-0000-0000-0000-000000000004', 'The Honeycrisp rosé was incredible. Where can I get more?', now() - interval '1 days'),
  ((select id from public.plan_aftermath_posts where plan_id='b2000000-0000-0000-0000-000000000006' limit 1), 'a1000000-0000-0000-0000-000000000004', 'That first precision jump moment is unforgettable. Welcome to the community!', now() - interval '6 days')
on conflict do nothing;

-- 9. Create plan passes with memos for upcoming events
insert into public.plan_passes (plan_id, memo, updated_at)
values
  ('b1000000-0000-0000-0000-000000000001', 'Rooftop access through the glass doors on the 8th floor. BYO snacks.', now() - interval '1 day'),
  ('b1000000-0000-0000-0000-000000000002', 'Ask for the basement room at the front desk. First drink on the house.', now() - interval '2 days'),
  ('b1000000-0000-0000-0000-000000000003', 'Materials provided. Wear something you do not mind getting ink on.', now() - interval '3 days'),
  ('b1000000-0000-0000-0000-000000000004', 'Meet at Pier 84 dock. Kayaks and vests provided. 6:30am sharp.', now() - interval '12 hours'),
  ('b1000000-0000-0000-0000-000000000005', 'Community kitchen, back entrance. Ingredients covered. Bring an apron.', now() - interval '1 day'),
  ('b1000000-0000-0000-0000-000000000006', 'East side of the park near the dog run. Mats provided. Arrive 5 mins early.', now() - interval '6 hours')
on conflict do nothing;
