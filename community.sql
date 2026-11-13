-- คอมมูนิตี้: ฟีดโพสต์ + ห้องแชทเรียลไทม์ + โปรไฟล์ + แอดมิน
-- รันใน Supabase SQL Editor หลัง schema.sql, admin.sql (และไฟล์อื่น ๆ ที่เคยรัน) — รันซ้ำได้ ข้อมูลเดิมไม่หาย

-- ---------- โปรไฟล์ ----------
alter table profiles add column if not exists display_name text check (char_length(display_name) <= 30);
alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists bio text check (char_length(bio) <= 300);
alter table profiles add column if not exists banned boolean not null default false;

-- ผู้ใช้ทั่วไปแก้ได้เฉพาะชื่อ/รูป/bio ของตัวเอง — role และ banned เปลี่ยนได้เฉพาะ admin
-- (เมื่อรันจาก SQL Editor หรือ service key จะไม่มี auth.uid() จึงข้ามการตรวจนี้ได้ เช่น ตั้ง admin คนแรก)
create or replace function guard_profile() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and not is_admin() then
    new.role := old.role; new.banned := old.banned; new.email := old.email;
  end if;
  return new;
end $$;
drop trigger if exists guard_profile_trg on profiles;
create trigger guard_profile_trg before update on profiles for each row execute function guard_profile();

drop policy if exists "own profile update" on profiles;
create policy "own profile update" on profiles for update using (id=auth.uid()) with check (id=auth.uid());

create or replace function is_banned() returns boolean language sql security definer stable set search_path=public as
$$ select coalesce((select banned from profiles where id=auth.uid()),false) $$;

-- มุมมองสาธารณะ: ไม่มีอีเมล ถ้ายังไม่ตั้งชื่อจะแสดงเป็น "สมาชิก-xxxx"
create or replace view member_profiles as
  select id, coalesce(nullif(display_name,''),'สมาชิก-'||substr(id::text,1,4)) as name,
         avatar_url, bio, role, banned, created_at
  from profiles;
grant select on member_profiles to anon, authenticated;

-- ---------- ฟีดโพสต์ ----------
create table if not exists posts(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  body text not null default '' check (char_length(body) <= 5000),
  image_url text,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  check (body <> '' or image_url is not null));
create index if not exists posts_feed_idx on posts (pinned desc, created_at desc);

create table if not exists comments(
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now());
create index if not exists comments_post_idx on comments (post_id, created_at);

create table if not exists post_likes(
  post_id uuid not null references posts on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id));

-- ตัวนับไลก์/คอมเมนต์ (ข้อมูลโพสต์เปิดอ่านได้ทุกคนอยู่แล้ว)
create or replace view post_stats as
  select p.id as post_id,
         (select count(*) from post_likes l where l.post_id=p.id) as likes,
         (select count(*) from comments c where c.post_id=p.id) as comments
  from posts p;
grant select on post_stats to anon, authenticated;

-- ---------- ห้องแชท ----------
create table if not exists channels(
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 40),
  description text check (char_length(description) <= 200),
  admin_only_post boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now());

create table if not exists messages(
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  image_url text,
  created_at timestamptz not null default now(),
  check (body <> '' or image_url is not null));
create index if not exists messages_chan_idx on messages (channel_id, created_at desc);

insert into channels(slug,name,description,admin_only_post,position) values
  ('general','ทั่วไป','คุยกันเรื่องอะไรก็ได้',false,1),
  ('announcements','ประกาศ','ประกาศจากทีมงาน (เฉพาะแอดมินโพสต์)',true,0),
  ('qna','ถามตอบ','มีอะไรสงสัยถามได้เลย',false,2)
on conflict (slug) do nothing;

-- ---------- กันสแปม: จำกัดความถี่ในการส่ง ----------
create or replace function throttle() returns trigger language plpgsql as $$
declare last_at timestamptz;
begin
  execute format('select max(created_at) from %I where user_id=$1', tg_table_name) into last_at using new.user_id;
  if last_at is not null and now() - last_at < make_interval(secs => tg_argv[0]::int) then
    raise exception 'ส่งถี่เกินไป รอสักครู่แล้วลองใหม่';
  end if;
  return new;
end $$;
drop trigger if exists throttle_posts on posts;
create trigger throttle_posts before insert on posts for each row execute function throttle(10);
drop trigger if exists throttle_comments on comments;
create trigger throttle_comments before insert on comments for each row execute function throttle(3);
drop trigger if exists throttle_messages on messages;
create trigger throttle_messages before insert on messages for each row execute function throttle(1);

-- ---------- สิทธิ์ (RLS) ----------
alter table posts enable row level security;
alter table comments enable row level security;
alter table post_likes enable row level security;
alter table channels enable row level security;
alter table messages enable row level security;

drop policy if exists "read posts" on posts;
create policy "read posts" on posts for select using (true);
drop policy if exists "insert posts" on posts;
create policy "insert posts" on posts for insert to authenticated with check (user_id=auth.uid() and not is_banned() and pinned=false);
drop policy if exists "admin edit posts" on posts;
create policy "admin edit posts" on posts for update using (is_admin()) with check (is_admin());
drop policy if exists "delete posts" on posts;
create policy "delete posts" on posts for delete to authenticated using (user_id=auth.uid() or is_admin());

drop policy if exists "read comments" on comments;
create policy "read comments" on comments for select using (true);
drop policy if exists "insert comments" on comments;
create policy "insert comments" on comments for insert to authenticated with check (user_id=auth.uid() and not is_banned());
drop policy if exists "delete comments" on comments;
create policy "delete comments" on comments for delete to authenticated using (user_id=auth.uid() or is_admin());

drop policy if exists "read likes" on post_likes;
create policy "read likes" on post_likes for select using (true);
drop policy if exists "insert likes" on post_likes;
create policy "insert likes" on post_likes for insert to authenticated with check (user_id=auth.uid() and not is_banned());
drop policy if exists "delete likes" on post_likes;
create policy "delete likes" on post_likes for delete to authenticated using (user_id=auth.uid());

drop policy if exists "read channels" on channels;
create policy "read channels" on channels for select using (true);
drop policy if exists "admin channels" on channels;
create policy "admin channels" on channels for all using (is_admin()) with check (is_admin());

drop policy if exists "read messages" on messages;
create policy "read messages" on messages for select using (true);
drop policy if exists "insert messages" on messages;
create policy "insert messages" on messages for insert to authenticated with check (
  user_id=auth.uid() and not is_banned()
  and (is_admin() or not coalesce((select admin_only_post from channels c where c.id=channel_id),false)));
drop policy if exists "delete messages" on messages;
create policy "delete messages" on messages for delete to authenticated using (user_id=auth.uid() or is_admin());

-- ---------- เรียลไทม์ ----------
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then
    alter publication supabase_realtime add table messages;
  end if;
end $$;

-- ---------- ที่เก็บรูป (ย่อรูปฝั่งเบราว์เซอร์ก่อนอัปโหลด ≤ 1 MB ต่อไฟล์) ----------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('community','community',true,1048576,array['image/webp','image/jpeg','image/png'])
on conflict (id) do update set public=true, file_size_limit=1048576, allowed_mime_types=array['image/webp','image/jpeg','image/png'];

drop policy if exists "community read" on storage.objects;
create policy "community read" on storage.objects for select using (bucket_id='community');
drop policy if exists "community upload" on storage.objects;
create policy "community upload" on storage.objects for insert to authenticated
  with check (bucket_id='community' and (storage.foldername(name))[1]=auth.uid()::text and not is_banned());
drop policy if exists "community delete" on storage.objects;
create policy "community delete" on storage.objects for delete to authenticated
  using (bucket_id='community' and ((storage.foldername(name))[1]=auth.uid()::text or is_admin()));

-- ---------- สถิติหน้า Admin ----------
create or replace function admin_stats() returns json language plpgsql security definer set search_path=public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return json_build_object('users',(select count(*) from profiles),'posts',(select count(*) from posts),
    'messages',(select count(*) from messages),'logs',(select count(*) from battle_logs),
    'tournaments',(select count(*) from tournaments),'news',(select count(*) from news));
end $$;
