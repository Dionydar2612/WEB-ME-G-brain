-- Pokémon TCG News Aggregator — migration (รันใน Supabase SQL Editor, รันซ้ำได้)
-- ลำดับ: schema.sql → admin.sql → facebook.sql → pokemon-news.sql (ไฟล์นี้)
-- ใช้ตาราง news เดิมต่อ (ข่าวเดิม/ข่าว Facebook ยังอยู่ครบ) แล้วเพิ่มคอลัมน์ที่จำเป็น

-- 1) คอลัมน์ใหม่ในตาราง news -------------------------------------------------
alter table news alter column user_id drop not null;
alter table news add column if not exists original_title text;
alter table news add column if not exists summary text;
alter table news add column if not exists content text;                 -- เก็บเฉพาะเมื่อได้รับอนุญาต (STORE_CONTENT=true)
alter table news add column if not exists category text not null default 'others';
alter table news add column if not exists thumbnail_url text;
alter table news add column if not exists source_name text;             -- null = ข่าวที่ admin โพสต์เอง/จาก Facebook
alter table news add column if not exists external_id text;
alter table news add column if not exists published_at timestamptz;
alter table news add column if not exists fetched_at timestamptz;
alter table news add column if not exists updated_at timestamptz not null default now();
alter table news add column if not exists status text not null default 'published';
alter table news add column if not exists is_featured boolean not null default false;
alter table news add column if not exists ai_generated boolean not null default false;
alter table news add column if not exists ai_attempts int not null default 0;

do $$ begin
  alter table news drop constraint if exists news_category_chk;
  alter table news add constraint news_category_chk
    check (category in ('products','events','tournaments','campaigns','announcements','columns','others'));
  if not exists (select 1 from pg_constraint where conname='news_status_chk') then
    alter table news add constraint news_status_chk check (status in ('published','hidden','pending'));
  end if;
end $$;

-- 2) backfill ข่าวเดิม ---------------------------------------------------------
update news set published_at=created_at where published_at is null;
update news set source_url=null where source_url is not null and btrim(source_url)='';
-- source_url ซ้ำในข้อมูลเดิม → ต่อท้าย #dup-<id> เพื่อให้ใส่ unique constraint ได้โดยไม่ทิ้งลิงก์
update news n set source_url=n.source_url||'#dup-'||n.id::text
  from (select id,row_number() over(partition by source_url order by created_at,id) rn from news where source_url is not null) d
 where n.id=d.id and d.rn>1;

-- 3) Unique Constraint ป้องกันข่าวซ้ำ (NULL หลายแถวได้) --------------------------
do $$ begin
  if not exists (select 1 from pg_constraint where conname='news_source_url_key') then
    alter table news add constraint news_source_url_key unique (source_url);
  end if;
end $$;
create index if not exists news_list_idx on news (status, is_featured desc, published_at desc);
create index if not exists news_category_idx on news (category);

-- 4) trigger: ค่าเริ่มต้นเวลา + updated_at --------------------------------------
create or replace function news_before_write() returns trigger language plpgsql as $$
begin
  if tg_op='INSERT' then
    new.published_at := coalesce(new.published_at, new.created_at, now());
    new.fetched_at := coalesce(new.fetched_at, now());
  else
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists news_before_write on news;
create trigger news_before_write before insert or update on news for each row execute function news_before_write();

-- 5) บัญชีดำ URL: ข่าวที่ admin ลบ (เฉพาะข่าวที่ scraper ดึงมา) จะไม่ถูกดึงกลับมาอีก
create table if not exists news_blocklist(
  source_url text primary key, blocked_at timestamptz not null default now());
alter table news_blocklist enable row level security;
drop policy if exists "admin read blocklist" on news_blocklist;
create policy "admin read blocklist" on news_blocklist for select using (is_admin());
drop policy if exists "admin del blocklist" on news_blocklist;
create policy "admin del blocklist" on news_blocklist for delete using (is_admin());

create or replace function news_after_delete() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.source_name is not null and old.source_url is not null then
    insert into news_blocklist(source_url) values (old.source_url) on conflict do nothing;
  end if;
  return old;
end $$;
drop trigger if exists news_after_delete on news;
create trigger news_after_delete after delete on news for each row execute function news_after_delete();

-- 6) log การทำงานของ Scraper + ตั้งค่า ----------------------------------------
create table if not exists scraper_runs(
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','success','partial','error')),
  trigger text,                         -- schedule | manual | cli
  found int default 0, inserted int default 0, summarized int default 0, failed int default 0,
  error text, details jsonb);
create index if not exists scraper_runs_started_idx on scraper_runs (started_at desc);
alter table scraper_runs enable row level security;
drop policy if exists "admin read runs" on scraper_runs;
create policy "admin read runs" on scraper_runs for select using (is_admin());

create table if not exists scraper_settings(
  key text primary key, value jsonb not null, updated_at timestamptz not null default now());
alter table scraper_settings enable row level security;
drop policy if exists "admin settings" on scraper_settings;
create policy "admin settings" on scraper_settings for all using (is_admin()) with check (is_admin());
insert into scraper_settings(key,value) values
  ('interval_minutes','30'), ('ai_enabled','true'), ('auto_publish','true'), ('manual_requested_at','false')
on conflict (key) do nothing;

-- 7) RLS: ผู้ใช้ทั่วไปเห็นเฉพาะข่าวที่ published (admin เห็นทั้งหมดผ่าน policy "admin news" ใน admin.sql)
drop policy if exists "read news" on news;
drop policy if exists "read published news" on news;
create policy "read published news" on news for select using (status='published');
