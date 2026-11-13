create table if not exists my_tournaments(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null, played_on date not null default current_date,
  category text, format text, placement text,
  decklist_id uuid references decklists on delete set null,
  my_deck text, players int, total_rounds int, cut int, notes text,
  rounds jsonb not null default '[]',
  created_at timestamptz default now());
alter table my_tournaments enable row level security;
drop policy if exists "own my_tournaments" on my_tournaments;
create policy "own my_tournaments" on my_tournaments for all using (user_id=auth.uid()) with check (user_id=auth.uid());
