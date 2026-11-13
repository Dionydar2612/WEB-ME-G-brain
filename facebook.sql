-- รันใน Supabase SQL Editor (รันซ้ำได้)
alter table news alter column user_id drop not null;
alter table news add column if not exists fb_post_id text unique;
alter table news add column if not exists image_url text;
