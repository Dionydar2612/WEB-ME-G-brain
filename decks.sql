-- การ์ด + เด็คสาธารณะ (แกลเลอรี) — migration (รันใน Supabase SQL Editor, รันซ้ำได้)
-- ลำดับ: schema.sql → admin.sql → (facebook.sql, pokemon-news.sql) → decks.sql (ไฟล์นี้)
-- ตาราง decklists เดิมยังใช้ต่อ (เด็คเก่าไม่หาย)

-- 1) ตารางการ์ด (scraper เขียนด้วย service_role, ทุกคนอ่านได้) -----------------
create table if not exists cards(
  id text primary key,                      -- th-14720
  source_id int unique not null,
  name text not null, supertype text,       -- pokemon | trainer | energy
  energy_type text, hp int, stage text,
  expansion text, expansion_name text, number text, illustrator text, flavor text,
  image_url text, source_url text,
  fetched_at timestamptz not null default now());
create index if not exists cards_name_idx on cards (name);
create index if not exists cards_type_idx on cards (supertype, energy_type);
alter table cards enable row level security;
drop policy if exists "read cards" on cards;
create policy "read cards" on cards for select using (true);

-- 2) ขยาย decklists ให้เป็นแกลเลอรี ---------------------------------------------
alter table decklists alter column user_id drop not null;      -- เด็คที่ scraper นำเข้าไม่มีเจ้าของ
alter table decklists add column if not exists author_name text;
alter table decklists add column if not exists description text;
alter table decklists add column if not exists cover_url text;
alter table decklists add column if not exists cards jsonb not null default '[]';   -- [{q,n,sec,set,num,img,id}]
alter table decklists add column if not exists tags text[] not null default '{}';
alter table decklists add column if not exists format text;
alter table decklists add column if not exists source text not null default 'community';  -- community | limitless | pokecabook
alter table decklists add column if not exists source_name text;
alter table decklists add column if not exists source_url text;
alter table decklists add column if not exists player text;
alter table decklists add column if not exists event text;
alter table decklists add column if not exists placement text;
alter table decklists add column if not exists event_date date;
alter table decklists add column if not exists deck_code text;
alter table decklists add column if not exists views int not null default 0;
alter table decklists add column if not exists likes int not null default 0;
alter table decklists add column if not exists updated_at timestamptz not null default now();
create unique index if not exists decklists_source_url_key on decklists (source_url);
create index if not exists decklists_gallery_idx on decklists (is_public, created_at desc);
create index if not exists decklists_tags_idx on decklists using gin (tags);

-- admin แก้ไข/ซ่อนเด็คของใครก็ได้
drop policy if exists "admin edit decks" on decklists;
create policy "admin edit decks" on decklists for update using (is_admin()) with check (is_admin());

-- 3) ไลก์ ------------------------------------------------------------------------
create table if not exists deck_likes(
  deck_id uuid not null references decklists on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (deck_id, user_id));
alter table deck_likes enable row level security;
drop policy if exists "read likes" on deck_likes;   create policy "read likes" on deck_likes for select using (true);
drop policy if exists "own likes" on deck_likes;    create policy "own likes" on deck_likes for all using (user_id=auth.uid()) with check (user_id=auth.uid());

create or replace function deck_likes_count() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then update decklists set likes=likes+1 where id=new.deck_id;
  else update decklists set likes=greatest(0,likes-1) where id=old.deck_id; end if;
  return null;
end $$;
drop trigger if exists deck_likes_count on deck_likes;
create trigger deck_likes_count after insert or delete on deck_likes for each row execute function deck_likes_count();

-- 4) ยอดดู (วันนี้/สัปดาห์/เดือน/ทั้งหมด) -------------------------------------------
create table if not exists deck_views(
  id bigint generated always as identity primary key,
  deck_id uuid not null references decklists on delete cascade,
  viewed_at timestamptz not null default now());
create index if not exists deck_views_idx on deck_views (viewed_at desc, deck_id);
alter table deck_views enable row level security;          -- ไม่มี policy = เขียน/อ่านตรงไม่ได้ ต้องผ่านฟังก์ชันด้านล่าง

create or replace function track_deck_view(p_deck uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from decklists where id=p_deck and (is_public or user_id=auth.uid())) then
    insert into deck_views(deck_id) values (p_deck);
    update decklists set views=views+1 where id=p_deck;
  end if;
end $$;
grant execute on function track_deck_view(uuid) to anon, authenticated;

create or replace function deck_view_counts(p_since timestamptz) returns table(deck_id uuid, n bigint) language sql security definer stable set search_path=public as $$
  select v.deck_id, count(*) from deck_views v join decklists d on d.id=v.deck_id where d.is_public and v.viewed_at>=p_since group by v.deck_id $$;
grant execute on function deck_view_counts(timestamptz) to anon, authenticated;

-- 5) บัญชีดำ: เด็คที่ admin ลบ (เฉพาะที่ scraper นำเข้า) จะไม่ถูกดึงกลับมา ---------
create table if not exists deck_blocklist(source_url text primary key, blocked_at timestamptz not null default now());
alter table deck_blocklist enable row level security;
drop policy if exists "admin read deck_blocklist" on deck_blocklist; create policy "admin read deck_blocklist" on deck_blocklist for select using (is_admin());
drop policy if exists "admin del deck_blocklist" on deck_blocklist;  create policy "admin del deck_blocklist" on deck_blocklist for delete using (is_admin());
create or replace function decklists_after_delete() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.source<>'community' and old.source_url is not null then insert into deck_blocklist(source_url) values (old.source_url) on conflict do nothing; end if;
  return old;
end $$;
drop trigger if exists decklists_after_delete on decklists;
create trigger decklists_after_delete after delete on decklists for each row execute function decklists_after_delete();

-- 6) updated_at + กันผู้ใช้ทั่วไปแก้ตัวเลข/แหล่งที่มา ------------------------------
create or replace function decklists_before_write() returns trigger language plpgsql as $$
begin
  if tg_op='INSERT' then
    if auth.uid() is not null and not is_admin() then new.views:=0; new.likes:=0; new.source:='community'; new.source_url:=null; new.source_name:=null; end if;
  else
    new.updated_at:=now();
    if auth.uid() is not null and not is_admin() then new.views:=old.views; new.likes:=old.likes; new.source:=old.source; new.source_url:=old.source_url; new.source_name:=old.source_name; end if;
  end if;
  return new;
end $$;
drop trigger if exists decklists_before_write on decklists;
create trigger decklists_before_write before insert or update on decklists for each row execute function decklists_before_write();

-- 7) admin_stats เพิ่มจำนวนการ์ด
create or replace function admin_stats() returns json language plpgsql security definer set search_path=public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return json_build_object('users',(select count(*) from profiles),'logs',(select count(*) from battle_logs),
    'tournaments',(select count(*) from tournaments),'decks',(select count(*) from decklists),'news',(select count(*) from news),
    'cards',(select count(*) from cards));
end $$;
