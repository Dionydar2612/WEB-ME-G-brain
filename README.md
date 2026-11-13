# จี่สมอง — วิธีใช้
1. Supabase: สร้างโปรเจกต์ → SQL Editor → รัน schema.sql แล้วรัน admin.sql ต่อ (เคยรัน schema.sql ไปแล้ว รัน admin.sql อย่างเดียวพอ)
   จากนั้นสมัครบัญชีของคุณในเว็บ แล้วรัน: update profiles set role='admin' where email='อีเมลคุณ';
2. Supabase > Authentication > URL Configuration: ใส่ URL ของ Render เป็น Site URL
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

## การ์ด + เด็คสาธารณะ (แกลเลอรี) 🃏🎴
หน้าใหม่: `#/decks` (เด็คสาธารณะ: เด็คยอดฮิต, ค้นหา/แท็ก `#`, ตัวกรอง, เรียงตามล่าสุด/ไลก์/ยอดดูวัน-สัปดาห์-เดือน-ทั้งหมด), `#/decks/new` (ตัวสร้างเด็ค), `#/decks/<id>` (รายละเอียด ไลก์ คัดลอกลิสต์ ทำสำเนา), `#/cards` (ฐานข้อมูลการ์ด)
ไฟล์: `decks.js` + `decks.css` (หน้าเว็บ) · `decks.sql` (ฐานข้อมูล) · `scraper/sync-tcg.js` + `scraper/tcg-parser.js` (ดึงข้อมูล) · `.github/workflows/sync-tcg.yml`

### ตั้งค่าครั้งแรก
1. Supabase SQL Editor: รัน `decks.sql` (หลัง schema.sql + admin.sql; รันซ้ำได้ เด็คเดิมไม่หาย)
2. GitHub Secrets ใช้ชุดเดิม (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`) — Variables ที่ปรับได้ดูใน `.env.example` ส่วน "การ์ด + เด็คสาธารณะ"
3. **ตรวจก่อนเปิดใช้จริง:** `cd scraper && npm ci && node sync-tcg.js --dry-run` (ต้องรันจากเครื่องที่เข้าเว็บต้นทางได้) ดูผลที่พิมพ์ว่าชื่อ/รูป/ใบ/จำนวนถูกต้อง
4. แท็บ Actions > sync-tcg > Run workflow (ตั้ง `only` เป็น `cards` หรือ `decks` ได้) — หลังจากนั้นรันเองทุก 6 ชม. การ์ดจะค่อย ๆ ครบทีละรอบ (จำตำแหน่งไว้ใน `scraper_settings.cards_cursor`) ดูสถานะที่ Admin > เด็ค
5. ทดสอบอัตโนมัติ: `cd scraper && npm test`

### แหล่งข้อมูล
- **การ์ด**: `asia.pokemon-card.com/th/card-search/` (หน้ารายการ → หน้ารายละเอียด เช่น /detail/14720/) เก็บชื่อ, ประเภท, HP, ธาตุ, ชุด, เลขการ์ด, นักวาด, คำอธิบาย และ **ลิงก์รูป** `…/th/card-img/th000XXXXX.png`
- **เด็ค**: `limitlesstcg.com/decks/<id>` (ดึงลิงก์ decklist ล่าสุด → `/decks/list/<id>` ได้ รายการการ์ด+จำนวน+รูป+ผู้เล่น+อันดับ+ภาพรวมของเด็ค) และ `pokecabook.com/archives/<id>` (ภาพรวมเด็ค+รหัสเด็คทางการ) — ใส่ URL เพิ่มได้ใน `DECK_SOURCE_URLS` (คั่น `,`) รองรับ 3 รูปแบบ: `/decks/<id>`, `/decks/list/<id>`, `pokecabook.com/archives/<id>`
- ทุกเด็คที่ดึงมาแสดงชื่อแหล่งที่มา + ลิงก์กลับต้นทาง; เด็คที่ admin ลบจะไม่ถูกดึงกลับ (`deck_blocklist`)

### หมายเหตุสำคัญ
- รูปการ์ด/รูปภาพรวมเป็น **ลิงก์ไปยังรูปต้นทาง** (hotlink) ไม่ได้ดาวน์โหลดมาเก็บ — ถ้าเว็บต้นทางเปลี่ยน/ปิดลิงก์รูปจะแสดงเป็นชื่อการ์ดแทน ลิขสิทธิ์ภาพเป็นของ The Pokémon Company ฯลฯ และของเจ้าของเว็บต้นทาง ควรตรวจเงื่อนไขการใช้งานของแต่ละเว็บ (ปิดการแสดงรูปจากเว็บอื่นได้ด้วย `ALLOW_DECK_IMAGES=false`)
- scraper เคารพ robots.txt และหน่วงเวลา 2 วินาทีต่อคำขอ; ถ้าเว็บใดบล็อกบอท (เช่น Pokecabook อาจใช้ bot detection) รอบนั้นจะรายงานเป็นปัญหาใน Admin แต่แหล่งอื่นยังทำงานต่อ
- ตัวแยก HTML (`tcg-parser.js`) เขียนจากโครงสร้างที่สังเกตได้และทดสอบกับข้อมูลจำลอง — ยังไม่เคยรันกับ HTML จริงทุกหน้า ให้ใช้ `--dry-run` ตรวจก่อน (Pokecabook โดยเฉพาะ ตรวจไม่ได้เพราะเว็บบล็อกตอนพัฒนา)
- ตัวสร้างเด็คค้นหาการ์ดจากฐานข้อมูลภาษาไทย; การนำเข้าลิสต์ภาษาอังกฤษ (PTCG Live) จะได้รูปเฉพาะชื่อที่ตรงกับในฐานข้อมูล ที่เหลือแสดงเป็นชื่อ


## การปรับปรุงเพื่อลดการใช้ทรัพย์สินทางปัญญาของบุคคลภายนอก

เวอร์ชันนี้ปรับหน้า Card Database และ Deck Builder ให้แสดงข้อมูลแบบข้อความ ไม่แสดงภาพการ์ด ภาพปกเด็ค หรือภาพข่าวจาก URL ภายนอก และเพิ่มหน้า About, Disclaimer, Copyright Policy และ Contact

### ขั้นตอนก่อนเปิดใช้งาน

1. สำรองฐานข้อมูล Supabase ก่อนทุกครั้ง
2. ตรวจสอบว่าได้รัน `schema.sql`, `facebook.sql`, `pokemon-news.sql` และ `decks.sql` ตามลำดับแล้ว
3. เปิด Supabase SQL Editor แล้วตรวจสอบ `copyright_cleanup.sql` จากนั้นจึงรันด้วยตนเอง
4. Deploy Static Site ตามขั้นตอนเดิม
5. ตรวจสอบหน้า News, Cards, Deck Builder, Deck Gallery, Tournament, Battle Logs และ Stats หลัง Deploy
6. เพิ่มอีเมลหรือช่องทางติดต่อจริงในหน้า Contact ก่อนเปิดรับคำร้องด้านลิขสิทธิ์

### การซิงก์ข้อมูลจากแหล่งภายนอก

ระบบซิงก์ข่าว การ์ด และเด็คจากแหล่งภายนอกถูกปิดไว้เป็นค่าเริ่มต้น เพื่อไม่ให้ระบบดึงหรือจัดเก็บเนื้อหาโดยอัตโนมัติก่อนตรวจสอบ Terms of Use และสิทธิ์การใช้งานของแต่ละแหล่ง

หากตรวจสอบแล้วว่ามีสิทธิ์และเงื่อนไขอนุญาต ให้เปิด GitHub Repository Variables ตามความจำเป็น:
- `NEWS_SYNC_ENABLED=true`
- `CARD_SYNC_ENABLED=true`
- `DECK_SYNC_ENABLED=true`

อย่าเปิดตัวแปรเหล่านี้เพียงเพราะหน้าเว็บเข้าถึงได้หรือมีการใส่เครดิต การเข้าถึงข้อมูลไม่ได้แปลว่าได้รับอนุญาตให้ดึง ทำซ้ำ จัดเก็บ หรือเผยแพร่

ภาพภายนอกยังคงปิดไว้เสมอใน workflow (`ALLOW_SOURCE_IMAGES=false`, `ALLOW_DECK_IMAGES=false`) การเพิ่มภาพใหม่ต้องผ่านการตรวจสอบสิทธิ์และการแก้ไขระบบโดยผู้ดูแลก่อน

### ข้อจำกัด

Disclaimer ไม่ได้ทำให้การใช้เนื้อหาที่ไม่ได้รับอนุญาตถูกกฎหมาย การเปลี่ยนแปลงนี้เป็นมาตรการลดความเสี่ยงทางเทคนิค ไม่ใช่การรับรองว่าเว็บไซต์จะไม่มีความเสี่ยงทางกฎหมาย ควรให้ผู้เชี่ยวชาญด้านทรัพย์สินทางปัญญาตรวจสอบก่อนเผยแพร่จริง
