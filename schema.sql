create table battle_logs(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  my_deck text, opp_deck text, result text, turns int, raw text,
  created_at timestamptz default now());
create table tournaments(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null, cut int not null default 8, total_rounds int not null,
  data jsonb not null default '{"players":[],"rounds":[]}',
  created_at timestamptz default now());
create table decklists(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null, list text not null, is_public boolean default true,
  created_at timestamptz default now());
create table news(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null, body text, source_url text,
  created_at timestamptz default now());

alter table battle_logs enable row level security;
alter table tournaments enable row level security;
alter table decklists enable row level security;
alter table news enable row level security;

create policy "own logs" on battle_logs for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "read tours" on tournaments for select using (true);
create policy "own tours" on tournaments for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "read decks" on decklists for select using (is_public or user_id=auth.uid());
create policy "own decks" on decklists for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "read news" on news for select using (true);
create policy "own news" on news for all using (user_id=auth.uid()) with check (user_id=auth.uid());
