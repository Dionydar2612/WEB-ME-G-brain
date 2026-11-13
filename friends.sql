-- ระบบเพื่อน: ส่งคำขอ / ยอมรับ / ปฏิเสธ / ยกเลิก / เลิกเป็นเพื่อน — รันหลัง community.sql, รันซ้ำได้
create table if not exists friendships(
  id uuid primary key default gen_random_uuid(),
  requester uuid not null default auth.uid() references auth.users on delete cascade,
  addressee uuid not null references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee));
-- คู่เดียวกันมีได้แถวเดียว ไม่ว่าใครส่งหาใคร
create unique index if not exists friendships_pair_idx on friendships (least(requester,addressee), greatest(requester,addressee));
create index if not exists friendships_addr_idx on friendships (addressee, status);
create index if not exists friendships_req_idx on friendships (requester, status);

-- กันแก้ข้อมูลนอกเหนือการกดยอมรับ: เปลี่ยนได้เฉพาะ status จาก pending → accepted
create or replace function guard_friendship() returns trigger language plpgsql as $$
begin
  if new.requester<>old.requester or new.addressee<>old.addressee or new.created_at<>old.created_at
     or not (old.status='pending' and new.status='accepted') then
    raise exception 'แก้ไขคำขอเพื่อนไม่ได้';
  end if;
  return new;
end $$;
drop trigger if exists guard_friendship_trg on friendships;
create trigger guard_friendship_trg before update on friendships for each row execute function guard_friendship();

-- จำกัดจำนวนคำขอที่ค้างอยู่ (กันสแปมส่งคำขอรัว ๆ)
create or replace function limit_friend_requests() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (select count(*) from friendships where requester=new.requester and status='pending')>=100 then
    raise exception 'ส่งคำขอเพื่อนที่ยังไม่ตอบได้ไม่เกิน 100 รายการ';
  end if;
  return new;
end $$;
drop trigger if exists limit_friend_requests_trg on friendships;
create trigger limit_friend_requests_trg before insert on friendships for each row execute function limit_friend_requests();

alter table friendships enable row level security;
drop policy if exists "see own friendships" on friendships;
create policy "see own friendships" on friendships for select to authenticated using (requester=auth.uid() or addressee=auth.uid());
drop policy if exists "send friend request" on friendships;
create policy "send friend request" on friendships for insert to authenticated
  with check (requester=auth.uid() and status='pending' and not is_banned());
drop policy if exists "accept friend request" on friendships;
create policy "accept friend request" on friendships for update to authenticated
  using (addressee=auth.uid() and status='pending') with check (addressee=auth.uid() and status='accepted' and not is_banned());
drop policy if exists "remove friendship" on friendships;
create policy "remove friendship" on friendships for delete to authenticated using (requester=auth.uid() or addressee=auth.uid());

-- จำนวนเพื่อนของสมาชิกแต่ละคน (แสดงสาธารณะเฉพาะตัวเลข ไม่เปิดรายชื่อ)
create or replace function friend_count(uid uuid) returns int language sql security definer stable set search_path=public as
$$ select count(*)::int from friendships where status='accepted' and (requester=uid or addressee=uid) $$;
grant execute on function friend_count(uuid) to anon, authenticated;
