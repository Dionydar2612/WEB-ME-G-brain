-- แชทส่วนตัวระหว่างเพื่อน (เห็นกันแค่ 2 คน) — รันหลัง friends.sql, รันซ้ำได้
create or replace function are_friends(a uuid,b uuid) returns boolean language sql security definer stable set search_path=public as
$$ select exists(select 1 from friendships where status='accepted' and ((requester=a and addressee=b) or (requester=b and addressee=a))) $$;

create table if not exists dm_messages(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,   -- ผู้ส่ง
  peer_id uuid not null references auth.users on delete cascade,                      -- ผู้รับ
  body text not null default '' check (char_length(body) <= 2000),
  image_url text,
  created_at timestamptz not null default now(),
  check (user_id <> peer_id),
  check (body <> '' or image_url is not null));
create index if not exists dm_a_idx on dm_messages (user_id, peer_id, created_at desc);
create index if not exists dm_b_idx on dm_messages (peer_id, user_id, created_at desc);

drop trigger if exists throttle_dm on dm_messages;
create trigger throttle_dm before insert on dm_messages for each row execute function throttle(1);

alter table dm_messages enable row level security;
-- อ่านได้เฉพาะผู้ส่งกับผู้รับ (แอดมินก็อ่านไม่ได้)
drop policy if exists "read own dm" on dm_messages;
create policy "read own dm" on dm_messages for select to authenticated using (user_id=auth.uid() or peer_id=auth.uid());
-- ส่งได้เฉพาะถึงคนที่เป็นเพื่อนกัน และไม่ถูกแบน
drop policy if exists "send dm to friend" on dm_messages;
create policy "send dm to friend" on dm_messages for insert to authenticated
  with check (user_id=auth.uid() and not is_banned() and are_friends(user_id,peer_id));
-- ลบได้เฉพาะข้อความของตัวเอง
drop policy if exists "delete own dm" on dm_messages;
create policy "delete own dm" on dm_messages for delete to authenticated using (user_id=auth.uid());

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='dm_messages') then
    alter publication supabase_realtime add table dm_messages;
  end if;
end $$;
