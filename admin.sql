-- รันหลัง schema.sql (ถ้ารัน schema.sql ไปแล้ว รันไฟล์นี้อย่างเดียวพอ) รันซ้ำได้
create table if not exists profiles(
  id uuid primary key references auth.users on delete cascade,
  email text, role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz default now());
alter table profiles enable row level security;

create or replace function is_admin() returns boolean language sql security definer stable set search_path=public as
$$ select exists(select 1 from profiles where id=auth.uid() and role='admin') $$;

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path=public as
$$ begin insert into profiles(id,email) values(new.id,new.email) on conflict do nothing; return new; end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

insert into profiles(id,email,created_at) select id,email,created_at from auth.users on conflict do nothing;

create or replace function admin_stats() returns json language plpgsql security definer set search_path=public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return json_build_object('users',(select count(*) from profiles),'logs',(select count(*) from battle_logs),
    'tournaments',(select count(*) from tournaments),'decks',(select count(*) from decklists),'news',(select count(*) from news));
end $$;

drop policy if exists "read profiles" on profiles;
create policy "read profiles" on profiles for select using (id=auth.uid() or is_admin());
drop policy if exists "admin edit profiles" on profiles;
create policy "admin edit profiles" on profiles for update using (is_admin()) with check (is_admin());

-- ข่าว: ทุกคนอ่านได้ แต่ admin เท่านั้นที่โพสต์/ลบ/แก้
drop policy if exists "own news" on news;
drop policy if exists "admin news" on news;
create policy "admin news" on news for all using (is_admin()) with check (is_admin());

-- admin ลบทัวร์/เด็คสาธารณะที่ไม่เหมาะสมได้
drop policy if exists "admin del tours" on tournaments;
create policy "admin del tours" on tournaments for delete using (is_admin());
drop policy if exists "admin del decks" on decklists;
create policy "admin del decks" on decklists for delete using (is_admin());

-- ตั้งตัวเองเป็น admin คนแรก (แก้อีเมล แล้วรันบรรทัดนี้):
-- update profiles set role='admin' where email='you@example.com';
