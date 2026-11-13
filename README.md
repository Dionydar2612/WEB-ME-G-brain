# จี่สมอง — วิธีใช้
1. Supabase: สร้างโปรเจกต์ → SQL Editor → รัน schema.sql แล้วรัน admin.sql ต่อ (เคยรัน schema.sql ไปแล้ว รัน admin.sql อย่างเดียวพอ)
   จากนั้นสมัครบัญชีของคุณในเว็บ แล้วรัน: update profiles set role='admin' where email='อีเมลคุณ';
2. รัน community.sql เพื่อเปิดใช้ฟีด/ห้องแชท (ดูหัวข้อ "คอมมูนิตี้" ด้านล่าง)
3. Supabase > Authentication > URL Configuration: ใส่ URL ของ Render เป็น Site URL
   (ถ้าไม่อยากยืนยันอีเมลตอนสมัคร ปิด "Confirm email" ที่ Providers > Email)

## รันในเครื่อง
cp .env.example .env  (แล้วใส่ค่าจริง)
node build.js && python3 -m http.server 8000   → เปิด http://localhost:8000

## Deploy บน Render
push ขึ้น GitHub → Render > New > Static Site (หรือ Blueprint ใช้ render.yaml)
Build Command: node build.js   Publish Directory: .
Environment: ตั้ง SUPABASE_URL และ SUPABASE_KEY (anon key เท่านั้น ห้ามใช้ service_role)

## ซิงก์โพสต์จาก Facebook Page → หน้าข่าว
1. รัน facebook.sql ใน Supabase
2. สร้าง Meta app (developers.facebook.com) → Graph API Explorer เลือกเพจของคุณ ขอสิทธิ์ pages_show_list, pages_read_engagement
   แลกเป็น long-lived user token แล้วเรียก /me/accounts จะได้ Page token ที่ไม่หมดอายุ + Page ID
   (ตรวจที่ Access Token Debugger ช่อง Expires ต้องเป็น Never — ถ้า workflow ขึ้น "Session has expired" แปลว่า token ที่ใส่ไว้ไม่ใช่ Page token แบบถาวร ให้ออกใหม่)
   สคริปต์ดึงโพสต์ล่าสุด 25 รายการ รวมโพสต์ที่แชร์/คลิปด้วย (ถ้าไม่มีข้อความ จะใช้คำอธิบายหรือชื่อของสิ่งที่แนบแทน) — ยังไม่รวม Reels และโพสต์ที่คนอื่นโพสต์บนเพจ
3. GitHub repo > Settings > Secrets and variables > Actions เพิ่ม 4 ค่า:
   FB_PAGE_ID, FB_PAGE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY (service_role key จาก Supabase — เก็บเป็น secret เท่านั้น)
4. แท็บ Actions > sync-facebook > Run workflow เพื่อทดสอบ (หลังจากนั้นรันเองทุก 30 นาที)

## Pokémon TCG News Aggregator (ข่าวจาก Pokémon Card Game Asia → หน้าข่าวสาร)
โครงสร้าง: `scraper/` (Node 20, รันบน GitHub Actions ทุก 30 นาที) → ตาราง `news` ใน Supabase เดิม → หน้า `#/news` และ `#/news/<id>` ใน index.html
แยกโค้ด: `scraper/http.js` (ดึง/robots/rate limit) · `parser.js` (แยก HTML) · `categories.js` · `ai.js` (AI Service) · `db.js` · `index.js` (orchestrator)

### ตั้งค่าครั้งแรก
1. Supabase SQL Editor: รัน `pokemon-news.sql` (หลัง schema.sql, admin.sql, facebook.sql) — ข่าวเดิมและข่าว Facebook ยังอยู่ครบ
2. GitHub repo > Settings > Secrets and variables > Actions
   - Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (ใช้ชุดเดียวกับ sync-facebook), ถ้าใช้ AI: `AI_API_KEY`; (ไม่บังคับ) `ERROR_WEBHOOK_URL`
   - Variables (ไม่บังคับ): `AI_ENABLED=true`, `AI_PROVIDER` (anthropic|openai), `AI_MODEL`, `AI_BASE_URL`, `ALLOW_SOURCE_IMAGES`, `STORE_CONTENT`
3. Render ไม่ต้องเพิ่ม env ใด ๆ (เว็บยังใช้แค่ SUPABASE_URL/SUPABASE_KEY) — ดูตัวอย่างทั้งหมดใน `.env.example`
4. แท็บ Actions > sync-pokemon-news > Run workflow เพื่อทดสอบ แล้วดูผลที่ Admin Panel > ข่าว

### ทดสอบ
- เทสต์อัตโนมัติ (ข้อมูลจำลอง ไม่แตะเน็ต): `cd scraper && npm ci && npm test`
- ลองดึงจริงแบบไม่เขียน DB: `cd scraper && node index.js --dry-run` (ต้องรันจากเครื่องที่เข้า asia.pokemon-card.com ได้) — **ตรวจผลที่พิมพ์ออกมา (หัวข้อ/วันที่/หมวด) ก่อนเปิดใช้งานจริง**
- รันจริงในเครื่อง: ใส่ SUPABASE_URL + SUPABASE_SERVICE_KEY ใน .env แล้ว `node scraper/index.js --force`

### หมายเหตุสำคัญ
- รูปและเนื้อหาต้นฉบับ **ไม่ถูกเก็บโดยค่าเริ่มต้น** (`ALLOW_SOURCE_IMAGES=false`, `STORE_CONTENT=false`) → เว็บแสดง placeholder + สรุป + ลิงก์ต้นฉบับ เปิดได้เมื่อได้รับสิทธิ์
- ข่าวที่ admin ลบ (เฉพาะที่ scraper ดึงมา) จะถูกบันทึกใน `news_blocklist` และไม่ถูกดึงกลับ; ต้องการซ่อนชั่วคราวให้ใช้ "ซ่อน"
- ปุ่ม "สั่งตรวจสอบข่าวใหม่" ตั้งธงไว้ให้รอบ cron ถัดไป (≤30 นาที) — เว็บเป็น static ไม่มี backend จึงสั่งรันทันทีไม่ได้โดยไม่เปิดเผย token; ต้องการทันทีให้กด Run workflow ที่ GitHub

## คอมมูนิตี้ (ฟีดโพสต์ + ห้องแชท) 💬
เว็บนี้เป็นชุมชนเดียว: **ข่าวจากเพจ** เป็นหน้าแรก → **ฟีดชุมชน** (`#/feed` โพสต์ข้อความ/รูป ไลก์ คอมเมนต์ ปักหมุด) → **ห้องแชทเรียลไทม์** (`#/chat/<ห้อง>` แบบ Discord) → **โปรไฟล์สมาชิก** (`#/u/<id>`)
ทุกคนอ่านได้โดยไม่ต้องล็อกอิน แต่ต้องล็อกอินถึงจะโพสต์/คอมเมนต์/ไลก์/แชทได้
ไฟล์: `community.js` + `community.css` (หน้าเว็บ) · `community.sql` (ฐานข้อมูล สิทธิ์ ที่เก็บรูป)

### ตั้งค่าครั้งแรก
1. Supabase SQL Editor: รัน `community.sql` (หลัง schema.sql, admin.sql และไฟล์อื่นที่เคยรัน; **รันซ้ำได้ ข้อมูลเดิมไม่หาย**) — จะสร้างตาราง โพสต์/คอมเมนต์/ไลก์/ห้องแชท/ข้อความ, ที่เก็บรูป `community` และห้องเริ่มต้น 3 ห้อง (#ทั่วไป, #ประกาศ เฉพาะแอดมิน, #ถามตอบ)
2. ตรวจว่า Realtime เปิดให้ตาราง `messages` แล้ว: Supabase > Database > Replication (สคริปต์เปิดให้อัตโนมัติ ถ้าไม่ขึ้น ให้เปิดเอง) — ถ้าไม่เปิด ห้องแชทจะดึงข้อความใหม่ทุก 15 วินาทีแทน
3. ตั้งตัวเองเป็นแอดมิน (ถ้ายังไม่ได้ทำ): `update profiles set role='admin' where email='อีเมลคุณ';`
4. ไม่ต้องเพิ่ม env ใด ๆ บน Render

### การใช้งาน
- **สมาชิก**: ตั้งชื่อที่แสดง/รูป/แนะนำตัวที่ "บัญชีของฉัน" (ถ้าไม่ตั้ง จะแสดงเป็น "สมาชิก-xxxx" — ไม่เปิดเผยอีเมล)
- **แอดมิน**: ลบโพสต์/คอมเมนต์/ข้อความของใครก็ได้ด้วยปุ่ม 🗑️, ปักหมุดโพสต์ (📌) · Admin Panel > **สมาชิก** (ตั้ง/ถอดแอดมิน, แบน/ปลดแบน) · Admin Panel > **ช่องแชท** (สร้าง/แก้/ลบห้อง, ตั้งห้อง "เฉพาะแอดมินโพสต์")
- สมาชิกที่ถูกแบนยังอ่านได้ แต่โพสต์ คอมเมนต์ ไลก์ แชท และอัปโหลดรูปไม่ได้

### รูปภาพ
- ย่อรูปในเบราว์เซอร์ก่อนอัปโหลด (โพสต์/แชทด้านยาวไม่เกิน 1280 px, รูปโปรไฟล์ 256 px) แปลงเป็น WebP และจำกัดไม่เกิน 1 MB/ไฟล์ → ประหยัดพื้นที่ (แพ็กเกจฟรีของ Supabase เก็บได้ราว 1 GB)
- ตั้งแคช 1 ปี (`Cache-Control`) รูปที่โหลดแล้วไม่ถูกดาวน์โหลดซ้ำ; ลบโพสต์/ข้อความ/เปลี่ยนรูปโปรไฟล์ → ลบไฟล์ในที่เก็บให้ด้วย
- GIF ที่อัปโหลดจะกลายเป็นภาพนิ่ง (เฟรมแรก)

### กันสแปม/ความปลอดภัย
- ฐานข้อมูลจำกัดความถี่: โพสต์ ≥10 วินาที/ครั้ง, คอมเมนต์ ≥3 วินาที, แชท ≥1 วินาที (แก้ได้ท้ายไฟล์ `community.sql` ที่ `throttle(...)`)
- สมาชิกแก้ `role`/`banned` ของตัวเองไม่ได้ (มี trigger กัน) — ตั้งผ่าน SQL Editor หรือแอดมินเท่านั้น
- ข้อความทุกอย่างถูก escape ก่อนแสดง; แสดงเฉพาะรูปที่อยู่ในที่เก็บ `community` ของโปรเจกต์นี้
- ต้องการแก้ไข/ปรับกฎ: ดูส่วน "สิทธิ์ (RLS)" ใน `community.sql`

### หมายเหตุ
- การ์ดและเด็คสาธารณะถูกเอาออกจากหน้าเว็บ/scraper/workflow แล้ว ตารางเดิม (`cards`, `decklists` ฯลฯ) **ยังอยู่ใน Supabase ไม่ถูกลบ** — ถ้าไม่ใช้แล้วลบเองได้: `drop table if exists decklists cascade;` (ข้อมูลทัวร์ไม่หาย แค่ตัดความสัมพันธ์ของคอลัมน์ `decklist_id`)
- ฟีดไม่รีเฟรชเอง (ต้องรีเฟรชหน้า) ส่วนห้องแชทอัปเดตเรียลไทม์
