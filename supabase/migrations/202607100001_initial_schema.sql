create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'game_phase') then
    create type game_phase as enum (
      'LOBBY',
      'TEAM_SETUP',
      'ROUND_INTRO',
      'CHALLENGE_SELECTION',
      'QUESTION_ACTIVE',
      'VOTING_LOCKED',
      'ANSWER_REVEAL',
      'ROUND_DRAW',
      'SAVING_GRACE_CATEGORY',
      'SAVING_GRACE_ACTIVE',
      'SAVING_GRACE_RESULT',
      'SACRIFICIAL_LAMB_SELECTION',
      'SACRIFICIAL_LAMB_REVEAL',
      'CONSEQUENCE_CHOICE',
      'DRINK_CONFIRMATION',
      'CHALLENGE_REVEAL',
      'CHALLENGE_ACTIVE',
      'CHALLENGE_RESULT',
      'RESCUER_SELECTION',
      'RESCUER_REVEAL',
      'BOTTLE_FLIP_ACTIVE',
      'BOTTLE_FLIP_RESULT',
      'PIE_CONFIRMATION',
      'ROUND_COMPLETE',
      'FINAL_RESULTS'
    );
  end if;
end $$;

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  title text not null default 'Who Said That?',
  phase game_phase not null default 'LOBBY',
  team_count integer not null check (team_count between 3 and 8),
  host_token_hash text not null,
  current_round_number integer not null default 0,
  settings jsonb not null default '{}'::jsonb,
  phase_started_at timestamptz,
  phase_ends_at timestamptz,
  is_paused boolean not null default false,
  remaining_ms_when_paused integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public_room_state (
  room_id uuid primary key references rooms(id) on delete cascade,
  room_code text not null unique,
  state jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  team_index integer not null check (team_index >= 0 and team_index < 8),
  name text not null,
  color text not null,
  icon text not null default '*',
  score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, team_index)
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  team_id uuid references teams(id) on delete set null,
  display_name text not null,
  initials text not null,
  avatar_url text,
  token_hash text not null,
  join_order integer not null,
  status text not null default 'active' check (status in ('active', 'pending', 'inactive')),
  is_connected boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, token_hash),
  unique (room_id, join_order)
);

create table if not exists question_packs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid references question_packs(id) on delete set null,
  quote text not null,
  answer_options jsonb not null,
  correct_answer_id text not null,
  sent_at timestamptz not null,
  next_sender_options jsonb not null default '[]'::jsonb,
  correct_next_sender_id text,
  reaction_count integer not null default 0 check (reaction_count >= 0),
  category text,
  difficulty integer check (difficulty between 1 and 5),
  host_note text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists challenge_decks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists challenges (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid references challenge_decks(id) on delete set null,
  title text not null,
  instructions text not null,
  duration_seconds integer not null check (duration_seconds between 1 and 600),
  success_criteria text not null,
  props jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  question_id uuid references questions(id) on delete set null,
  round_number integer not null,
  phase game_phase not null default 'ROUND_INTRO',
  started_at timestamptz,
  locked_at timestamptz,
  revealed_at timestamptz,
  results jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, round_number)
);

create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  answer_id text not null,
  is_correct boolean,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, player_id)
);

create table if not exists round_leaders (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (round_id, team_id)
);

create table if not exists challenge_assignments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  chooser_team_id uuid not null references teams(id) on delete cascade,
  target_team_id uuid not null references teams(id) on delete cascade,
  chooser_player_id uuid references players(id) on delete set null,
  challenge_id uuid references challenges(id) on delete set null,
  options jsonb not null default '[]'::jsonb,
  selected_at timestamptz,
  was_random boolean not null default false,
  created_at timestamptz not null default now(),
  unique (round_id, chooser_team_id, target_team_id)
);

create table if not exists saving_grace_attempts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  leader_player_id uuid references players(id) on delete set null,
  category text check (category in ('TIME_OF_DAY', 'NEXT_SENDER', 'REACTION_COUNT')),
  answer text,
  correct_answer text,
  is_correct boolean,
  category_selected_at timestamptz,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (round_id, team_id)
);

create table if not exists penalties (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  round_id uuid references rounds(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  lamb_player_id uuid references players(id) on delete set null,
  rescuer_player_id uuid references players(id) on delete set null,
  consequence_choice text check (consequence_choice in ('DRINK', 'CHALLENGE')),
  challenge_assignment_id uuid references challenge_assignments(id) on delete set null,
  status text not null default 'pending',
  queue_index integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists game_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  actor_player_id uuid references players(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists rooms_room_code_idx on rooms(room_code);
create index if not exists rooms_host_token_hash_idx on rooms(host_token_hash);
create index if not exists teams_room_id_idx on teams(room_id);
create index if not exists players_room_id_idx on players(room_id);
create index if not exists players_team_id_idx on players(team_id);
create index if not exists players_token_hash_idx on players(token_hash);
create index if not exists questions_pack_id_idx on questions(pack_id);
create index if not exists challenges_deck_id_idx on challenges(deck_id);
create index if not exists rounds_room_id_idx on rounds(room_id);
create index if not exists votes_room_round_idx on votes(room_id, round_id);
create index if not exists votes_player_id_idx on votes(player_id);
create index if not exists round_leaders_round_id_idx on round_leaders(round_id);
create index if not exists challenge_assignments_round_id_idx on challenge_assignments(round_id);
create index if not exists saving_grace_round_id_idx on saving_grace_attempts(round_id);
create index if not exists penalties_room_status_idx on penalties(room_id, status, queue_index);
create index if not exists game_events_room_id_idx on game_events(room_id, created_at desc);

alter table rooms enable row level security;
alter table public_room_state enable row level security;
alter table teams enable row level security;
alter table players enable row level security;
alter table question_packs enable row level security;
alter table questions enable row level security;
alter table challenge_decks enable row level security;
alter table challenges enable row level security;
alter table rounds enable row level security;
alter table votes enable row level security;
alter table round_leaders enable row level security;
alter table challenge_assignments enable row level security;
alter table saving_grace_attempts enable row level security;
alter table penalties enable row level security;
alter table game_events enable row level security;

drop policy if exists "anon can read public room state" on public_room_state;
create policy "anon can read public room state"
  on public_room_state for select
  to anon
  using (true);

insert into challenge_decks (id, name, description)
values ('00000000-0000-0000-0000-000000000001', 'House Safe Deck', 'Safe, declinable, non-dangerous starter challenges.')
on conflict (id) do nothing;

insert into challenges (deck_id, title, instructions, duration_seconds, success_criteria, props)
values
  ('00000000-0000-0000-0000-000000000001', 'Silent Charades', 'Act out a movie title chosen by the host without speaking.', 45, 'At least one teammate guesses close enough for the host to approve.', '{"declinable": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'One-Handed Stack', 'Stack five lightweight cups using only one hand.', 30, 'The stack stands for three seconds.', '{"props": ["cups"], "declinable": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'Whisper Relay', 'Repeat a short phrase through two teammates by whispering.', 45, 'The final phrase keeps the main idea.', '{"declinable": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'Pose Match', 'Match a harmless pose shown by the host.', 20, 'The host judges the pose as close enough.', '{"declinable": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'Compliment Sprint', 'Give three sincere compliments to three different players.', 30, 'All three compliments are completed respectfully.', '{"declinable": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'Emoji Story', 'Tell a five-second story using only three emoji names.', 20, 'The story includes all three emoji names.', '{"declinable": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'Tabletop Curling', 'Slide a coaster toward a marked target on a table.', 20, 'The coaster stops inside the host-marked zone.', '{"props": ["coaster"], "declinable": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'Memory Chain', 'Repeat a chain of six simple words after the host reads them once.', 30, 'At least five words are recalled in order.', '{"declinable": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'Air Drawing', 'Draw an object in the air while teammates guess.', 30, 'A teammate guesses the object.', '{"declinable": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'Beat Keeper', 'Clap a steady rhythm for ten seconds while the host tries to distract you verbally.', 15, 'The rhythm stays recognizable for ten seconds.', '{"declinable": true}'::jsonb)
on conflict do nothing;

insert into question_packs (id, name, description)
values ('00000000-0000-0000-0000-000000000101', 'Starter Pack', 'Manual starter pack for imported group-chat quotes.')
on conflict (id) do nothing;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public_room_state;
  end if;
exception
  when duplicate_object then null;
end $$;
