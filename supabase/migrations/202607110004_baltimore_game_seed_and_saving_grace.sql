insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'answer-option-avatars',
  'answer-option-avatars',
  true,
  1000000,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public answer option avatar reads" on storage.objects;
create policy "public answer option avatar reads"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'answer-option-avatars');

create table if not exists answer_option_people (
  label text primary key,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists team_saving_grace_balances (
  room_id uuid not null references rooms(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  remaining_uses integer not null default 3 check (remaining_uses >= 0 and remaining_uses <= 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, team_id)
);

alter table answer_option_people enable row level security;
alter table team_saving_grace_balances enable row level security;

drop policy if exists "public answer option people reads" on answer_option_people;
create policy "public answer option people reads"
  on answer_option_people for select
  to anon, authenticated
  using (true);

alter table questions add column if not exists time_of_day text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'questions_time_of_day_check'
  ) then
    alter table questions
      add constraint questions_time_of_day_check
      check (time_of_day is null or time_of_day in ('Morning', 'Afternoon', 'Night'));
  end if;
end $$;

alter table saving_grace_attempts add column if not exists prompt text;
alter table saving_grace_attempts
  add column if not exists options jsonb not null default '[]'::jsonb;

create or replace function pg_temp.baltimore_option_id(label text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      trim(both '-' from regexp_replace(lower(label), '[^a-z0-9]+', '-', 'g')),
      ''
    ),
    'option'
  );
$$;

create temporary table baltimore_seed_rows (
  row_no integer primary key,
  speaker text not null,
  message text not null,
  time_of_day text not null,
  next_sender text not null
) on commit drop;

insert into baltimore_seed_rows (row_no, speaker, message, time_of_day, next_sender)
values
  (1, 'Victor', 'You think anyone here is serious???😂😂😂😂😂 think again o…everybody is hiding their true colors except me sha', 'Morning', 'Ada'),
  (2, 'Tolu', 'This is the best time to get into this kind of witchcraft', 'Morning', 'Ayomide'),
  (3, 'Victor', 'Na play o, make nobody listen to Md 😂😂😂😂😂😭😭😭😭😭 I only use ethanol to boil rice', 'Afternoon', 'Abi'),
  (4, 'Maria', 'Why is it me telling you?😂😂😂😂 na me tag myself?', 'Afternoon', 'Chidinma'),
  (5, 'Amarachi', 'Shame wear me like oversized agbada', 'Night', '+1 (667) 755-1082'),
  (6, 'Chidinma', 'I don’t do self help books🥲i want to remain crazy', 'Night', 'Victor'),
  (7, 'Obi', 'You’re looking for a godfearing man and you wan use people cook soup 🤣🤣🤣, this life no normal 😭😭', 'Afternoon', 'Nelson Baltimore Group'),
  (8, 'Ada', 'In this economy flower keh. Make I use am cook soup or pay bill 🫢', 'Night', 'Ada'),
  (9, 'Obi', 'I never see bad advice before now ooo, omo na when you Dey deep in relationship ,na when your colors suppose show 😂😂😌', 'Morning', 'Ada'),
  (10, 'Ayo', 'I feel like i can only run if someone is chasing me', 'Morning', 'Swalina'),
  (11, 'nahhh', 'Alomo bitters is crazyy😭.. na all those egbon adugbo dey drink am😭😭', 'Morning', '+1 (443) 272-9407'),
  (12, 'Chi', 'I like when its wrapped in 100s🥹 does that count🤣', 'Afternoon', 'Chidinma'),
  (13, 'OlaDap', 'Yes oO.. should I bring small bowl or m large one 😂 cause no be only me waka come 😂😂😂🙌🏾', 'Morning', 'OlaDap'),
  (14, 'Maria', 'You tagging the people that won’t even defend you😭😂😂😂 tagging women to defend men?', 'Afternoon', 'Ada'),
  (15, 'Obi', 'Look at that , you even Dey make my friend’s point for him . Una always want expensive food . What is wrong with Macdonald 😂😂😂😭. I’m dying', 'Afternoon', 'Chi'),
  (16, 'Chidinma', 'Cook soup for am and poor the salt until the spirit tells u to stop smile and feed him', 'Afternoon', 'Chinne'),
  (17, 'Chidinma', 'You watched scandal and don’t remember b613?!? How is that even possible😂😂😂', 'Afternoon', 'Chi'),
  (18, 'Chidinma', 'I only let ugly slide when they are condolence flowers 😭😭', 'Night', 'Chidinma'),
  (19, 'Modupe', 'There’s no part time wickedness o', 'Afternoon', 'Modupe'),
  (20, 'Victor', 'The same church offering me prayers?!!!??😂😂😂😂 I will be a member.', 'Morning', 'Victor'),
  (21, 'Obi', 'Why my name enter the mix 😂😂😂, I don’t want to intrude on your throuple', 'Afternoon', 'Abi'),
  (22, 'Ada', 'Men are not invited. They should collect their food from the spirit behind their wickedness 🫢', 'Morning', 'Oluseyi'),
  (23, 'Obi', 'Omo how we never even start podcast but people are already getting cancelled 😂😂😭', 'Afternoon', 'Modupe'),
  (24, 'Chidinma', 'The bartenders are wicked instead of making me a mixed drink they pour the whole bottle in a cup with a splash of juice', 'Afternoon', 'Chinne'),
  (25, 'Ayo', 'This is the greed they talk about in the bible !', 'Afternoon', 'Simi'),
  (26, 'Tolu', 'Sorry guys, I can’t come to Ms Shirley’s on Sunday, work has called and I’ve answered 🫩', 'Morning', '+1 (667) 755-1082'),
  (27, 'Maria', 'Someone’s remains is another man’s meat Abi no be how they talk am?😂😂😂', 'Afternoon', 'Ada'),
  (28, 'Victor', 'Choose peace sometimes….dont your body ever burn from too much wickedness and pain body?', 'Night', 'Victor'),
  (29, 'Ijay', 'Wahala please speak out oh! 😂😂 have you checked where you ate indomie yesterday? There should be AC there', 'Night', 'Modupe'),
  (30, 'Ayomide', 'Any body went to Houston here make we remove you 😂😂😂', 'Morning', 'Chi'),
  (31, 'Modupe', 'This is no longer ordinary thieving this is robbery corruption scam JAIL', 'Morning', 'Victor'),
  (32, 'Chidinma', 'Please remain wicked🙏that way i know my enemies', 'Night', 'Nelson Baltimore Group'),
  (33, 'Modupe', 'My wickedness have put me in trouble', 'Afternoon', 'Nelson Baltimore Group'),
  (34, 'Obi', 'I’ve never seen people bend fork before after eating 😂😂', 'Afternoon', 'Chidinma'),
  (35, 'Kez', 'I’m curious, have you watched anything and liked men a little more ? Or.It’s only hate that can be activated 😂😅😭😏', 'Morning', '+1 (667) 755-1082'),
  (36, 'Angel', 'Man what is going on?? 😭😭😭 A drunk math session while intentionally rubbing food in the girls faces ??', 'Night', 'Maria'),
  (37, 'Ayo', 'Alll hail Scorpios and saggiterrorists!!', 'Morning', 'Ayomide'),
  (38, 'Michelle', '“The search for spouses for both Chima and Ijay continues” lmaoooo it’s giving love island bye😭😂😂', 'Afternoon', 'Chidinma'),
  (39, 'Simi', 'Praise God, Sammy has been fed… we can all rest now', 'Afternoon', '+1 (443) 551-5286'),
  (40, 'Michelle', 'Are we at work? How are yall averaging 10k texts in minutes 😭😭😭', 'Morning', 'Modupe'),
  (41, 'Maria', 'This my prayer everyday that I’m not as stupid as first wives 😭because why do they never leave?', 'Afternoon', 'Chidinma'),
  (42, 'Tolu', 'Jealousy wan injure me', 'Afternoon', 'Tolu'),
  (43, 'Angel', 'Ah ah 😂 don’t twist my words o. I was defending women’s rights not submitting wife application 😭', 'Afternoon', 'Mind Yah Business'),
  (44, 'Modupe', 'I saw this tweet once and this girl was like a man telling her she’s gonna be the mother of his kids is a threat in this economy 😩😭', 'Morning', 'Chi Chi'),
  (45, 'Maria', 'Bro been hungry for a month now', 'Morning', 'Chi'),
  (46, 'NZI', 'abeg please…. i just want to go out on the weekends and vibe. my mission no be his own😭', 'Afternoon', 'Ayomide'),
  (47, 'Modupe', 'I don’t even know everybody in this gc I will use you to cook soup o if you’re not careful 😭👨🏾‍🍳', 'Afternoon', 'Obi'),
  (48, 'Ayomide', 'Yes I get his name is Jesus', 'Night', 'Sanusi OI LLC'),
  (49, 'Nonie', 'At this point we need background checks. Don’t want to be out here meeting criminals on the low😂😂', 'Afternoon', 'Itohan'),
  (50, 'Ayomide', 'I’m talking to you yes you', 'Morning', '+234 708 095 0808'),
  (51, 'Timmy', 'We have only two emotions in this world Love and heate and I’ve chosen to hate you😂😂', 'Night', 'Ada'),
  (52, 'Oluseyi', 'You cant bring a man down when he is already on the floor😂😂😂', 'Night', '+1 (240) 926-5454'),
  (53, 'OlaDap', 'Roll with the kini? 😂 inside rain? Dey play 😂', 'Night', 'Modupe'),
  (54, 'Angel', 'My guy do you have a meme for everything ? 😂😂', 'Afternoon', 'Chidinma'),
  (55, 'Michelle', 'I try to talk on here, but mane idk where to start from after 300+ messages e dey muzz me can’t lie😂', 'Afternoon', 'Ayomide'),
  (56, 'Umu', 'Obi why you dey form accent? 👀 😭', 'Afternoon', '+1 (443) 272-9407'),
  (57, 'Kez', 'You go hear word Abi you no go hear word! 😭😂', 'Afternoon', 'Ijay'),
  (58, 'Amarachi', 'On top small enjoyment, I will now go into debt😭😭😭', 'Afternoon', '+1 (667) 755-1082'),
  (59, 'Mind Yah Business', 'Oh so now we are your wives ? abeg out of the 24hrs use 20hrs to fear men and still use the remaining 4hrs to still fear me🚶🏽‍♀️🚶🏽‍♀️', 'Afternoon', 'Ada'),
  (60, 'Chidinma', 'You never know what person dey do for house ooo😂😂😂😂', 'Afternoon', 'Victor'),
  (61, 'Mind Yah Business', 'Control your wives? Respectfully, I''m not a drone and his subscription expired. 😭😂', 'Afternoon', 'Chidinma'),
  (62, 'Chinne', 'Can’t help people that don’t want to be saved 😭😂 we go try again next month to see if he get change of heart', 'Afternoon', 'Ada'),
  (63, 'Ada', 'Person wey get yansh as I’m being accused dey dey desperate? Don’t believer Adam o😭.', 'Morning', 'Ada'),
  (64, 'Ayo', 'Lmaooo i just be feeling so awkward and goofy looking like sometimes when i do my hot girl jog i look back so that way ppl don’t think im like jogging for fun yk?', 'Morning', 'OlaDap'),
  (65, 'Swalina', 'But quitting ur job and being financially dependent on a man u met 1 day ago is crazy to me😂', 'Night', 'Itohan'),
  (66, 'Falana Samuel', 'Don’t worry my memory dey okay cause i retraced my steps and the fact my weed was missing too 😂', 'Night', 'Chidinma'),
  (67, 'Tomiwa', 'What is this cloud that covered you? Could it be shame😂😂😂😝', 'Night', 'Mind Yah Business'),
  (68, 'UK', 'Which one be pele? 😂 I sabi enrique Iglesias tho', 'Night', 'Oluseyi'),
  (69, 'Ada', 'Yea I don’t think it’s that deep lol. Even if it’s clique or squad why’s that a bother? Are we in primary school', 'Night', 'Ore'),
  (70, 'UK', '1538 messages abeg nobody do summary last night?', 'Morning', 'Chi Chi'),
  (71, 'Amara Onokala', 'I don’t speak Yoruba but I asked chatgpt 😂', 'Afternoon', 'Amara Onokala'),
  (72, 'OlaDap', 'I no dey lose guard for food naaaaa aba 😂', 'Morning', '+1 (240) 926-5454'),
  (73, 'Mind Yah Business', 'I fit wake up dem don commot me😂😂', 'Night', '+234 811 231 9247'),
  (74, 'Abi', 'I’ve done that lol and I swore to never do it again 🤣…it was fun but I’m pretty sure I froze mid air', 'Afternoon', 'Maria'),
  (75, 'Tolu', 'Imagine me paying $300 to go and see sexy redd and chief keef? God forbid bad thing', 'Morning', '+1 (667) 755-1082'),
  (76, 'UK', 'See as things don change. Person wey cook now na husband material 🙆🏾‍♂️ no wahala make I enter kitchen 🚶‍♂️😂', 'Night', 'Maria'),
  (77, 'Swalina', 'I’m tired of this grandpa 😭 I can’t handle another pandemic ong', 'Night', 'Tolu'),
  (78, 'Timmy', 'What’s with the way you drag the hungerrrr Who you Dey try impress?', 'Afternoon', '+1 (240) 926-5454'),
  (79, 'Ijay', 'I swear you guys hate me because would you allow your sister marry Chima? 😭', 'Night', 'Modupe'),
  (80, 'Ore', 'Ah wahala, who are the people sharing men plz', 'Afternoon', 'Ore'),
  (81, 'Amarachi', 'And I’m busy cooking for myself???? Who’s this abeg?', 'Afternoon', 'Chidinma'),
  (82, 'Chi', 'If my mother can zip line so can you 💀 even though she complained all the way through and couldn’t turn back 🤣🤣🤣 yolo you only go to Costa Rica once', 'Afternoon', 'Maria'),
  (83, 'Ichie', 'Wait o It''s not me oooo Abeg Lesson learnt Don''t leave your phone with people when hosting a games night', 'Night', 'Modupe'),
  (84, 'Chidinma', 'you’re wicked ooo we know who dey carry last shaa', 'Night', 'Chinne'),
  (85, 'Tolu', 'You people don’t put the “😭” emoji again 😔, we’re losing recipes', 'Night', '+1 (816) 972-1100'),
  (86, 'Modupe', 'HOLD UP HOLD UP it never reach counterfeit side abeg. I’m one and only original', 'Afternoon', 'Modupe'),
  (87, 'Ore', 'I might do a little two step and comot very soon', 'Night', '+1 (717) 599-0445'),
  (88, 'Nonie', 'Girl like the accents alone and drama. For like 6weeks I will be role playing in British lingo. Abeg involve me o', 'Morning', 'Tolu'),
  (89, 'Timmy', 'Na you I Dey reply to? You no like mind your business 😭', 'Night', 'Ichie'),
  (90, 'Kez', 'lol in your imagination about your future you imagine it might go south? 😬', 'Afternoon', 'Victor'),
  (91, 'Oluseyi', 'make my mama dey shout blood of jesus when she video call me oluwa', 'Morning', 'Tolu'),
  (92, 'Ayomide', 'We don’t have any problem until you join', 'Afternoon', 'Ayomide'),
  (93, 'Itohan', 'So many fine babes here and you want to be Michael Myers? 😂😂', 'Morning', 'Amarachi'),
  (94, 'NZI', 'everyone here will return me one dollar if i don’t enjoy myself😂', 'Night', 'Angel'),
  (95, 'Amara Onokala', 'The bible said no rest for the wicked. I’m just living up to his words lol', 'Night', 'Amara Onokala'),
  (96, 'Anteneh Cooper', 'New to the platform is crazy like nigga ik you use WhatsApp', 'Night', 'Sid'),
  (97, 'Sid', 'Lmao abeg oo, I don’t do Yoruba demons💀', 'Afternoon', 'Ada'),
  (98, 'Umu', '$100 per shot from next week o! 🤣 you guys will fund my trip to Dubai', 'Afternoon', 'Umu'),
  (99, 'Amara Onokala', 'I’ve been wanting to come to tennis with y’all but I suck! The only sports I’m good at is to eat and to sleep', 'Afternoon', 'Maria'),
  (100, 'Amara Onokala', 'I said let me take small nap after work because Work drained me yesterday. That is how I opened my eyes at 4:34 AM.', 'Night', 'Angel'),
  (101, 'Ojebukola', 'I had a sneak peak to 🔥 and I told myself I gat go heaven', 'Night', 'Ojebukola');

insert into question_packs (id, name, description, enabled)
values (
  '00000000-0000-0000-0000-000000000201',
  'Baltimore Link Up',
  'Baltimore Link Up game questions imported from the corrected CSV.',
  true
)
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  enabled = true,
  updated_at = now();

delete from questions
where pack_id = '00000000-0000-0000-0000-000000000201';

with option_labels as (
  select speaker as label from baltimore_seed_rows
  union
  select next_sender as label from baltimore_seed_rows
),
classified_labels as (
  select
    label,
    label ~ '[+0-9][0-9 ()+.-]{6,}' as is_phone
  from option_labels
)
insert into answer_option_people (label, avatar_path, updated_at)
select
  label,
  case when is_phone then null else label || '.png' end,
  now()
from classified_labels
on conflict (label) do update
set
  avatar_path = excluded.avatar_path,
  updated_at = now();

with speakers as (
  select distinct speaker as label
  from baltimore_seed_rows
),
option_labels as (
  select distinct label
  from (
    select speaker as label from baltimore_seed_rows
    union all
    select next_sender as label from baltimore_seed_rows
  ) labels
),
classified_labels as (
  select
    label,
    label ~ '[+0-9][0-9 ()+.-]{6,}' as is_phone
  from option_labels
)
insert into questions (
  id,
  pack_id,
  quote,
  answer_options,
  correct_answer_id,
  sent_at,
  time_of_day,
  next_sender_options,
  correct_next_sender_id,
  reaction_count,
  category,
  difficulty,
  host_note,
  enabled
)
select
  ('00000000-0000-0000-0000-' || lpad((100000 + row_no)::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000201'::uuid,
  seed.message,
  answer_options.options,
  pg_temp.baltimore_option_id(seed.speaker),
  (
    case seed.time_of_day
      when 'Morning' then timestamptz '2026-07-11 09:00:00+00'
      when 'Afternoon' then timestamptz '2026-07-11 15:00:00+00'
      else timestamptz '2026-07-11 21:00:00+00'
    end
    + (seed.row_no * interval '1 minute')
  ),
  seed.time_of_day,
  next_sender_options.options,
  pg_temp.baltimore_option_id(seed.next_sender),
  0,
  'baltimore-link-up',
  1,
  'Seeded from Baltimore_Link_Up_Game_Data_Corrected.csv row ' || seed.row_no,
  true
from baltimore_seed_rows seed
cross join lateral (
  select jsonb_agg(
    jsonb_build_object('id', pg_temp.baltimore_option_id(option_row.label), 'name', option_row.label)
    order by option_row.sort_key
  ) as options
  from (
    select
      seed.speaker as label,
      md5(seed.row_no::text || ':answer:' || seed.speaker) as sort_key
    union all
    select
      distractor.label,
      md5(seed.row_no::text || ':answer:' || distractor.label) as sort_key
    from (
      select label
      from speakers
      where label <> seed.speaker
      order by md5(seed.row_no::text || ':answer-distractor:' || label)
      limit 3
    ) distractor
  ) option_row
) answer_options
cross join lateral (
  with forced_phone as (
    select label
    from classified_labels
    where label <> seed.next_sender
      and is_phone
    order by md5(seed.row_no::text || ':next-phone:' || label)
    limit 1
  ),
  remaining_distractors as (
    select label
    from classified_labels
    where label <> seed.next_sender
      and label not in (select label from forced_phone)
    order by md5(seed.row_no::text || ':next-distractor:' || label)
    limit (3 - (select count(*) from forced_phone))
  )
  select jsonb_agg(
    jsonb_build_object('id', pg_temp.baltimore_option_id(option_row.label), 'name', option_row.label)
    order by option_row.sort_key
  ) as options
  from (
    select
      seed.next_sender as label,
      md5(seed.row_no::text || ':next:' || seed.next_sender) as sort_key
    union all
    select
      label,
      md5(seed.row_no::text || ':next:' || label) as sort_key
    from forced_phone
    union all
    select
      label,
      md5(seed.row_no::text || ':next:' || label) as sort_key
    from remaining_distractors
  ) option_row
) next_sender_options;

update question_packs
set enabled = false, updated_at = now()
where id <> '00000000-0000-0000-0000-000000000201';

update questions
set enabled = false, updated_at = now()
where pack_id is distinct from '00000000-0000-0000-0000-000000000201';

update rooms
set
  settings = jsonb_set(
    settings,
    '{selectedQuestionPackId}',
    to_jsonb('00000000-0000-0000-0000-000000000201'::text),
    true
  ),
  updated_at = now();
