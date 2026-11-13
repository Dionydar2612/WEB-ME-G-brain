// ข้อมูลทดสอบ "สังเคราะห์" จำลองตามที่เห็นจากหน้าเว็บต้นทาง (ไม่ใช่ HTML จริงที่ดึงมา)
exports.LIST = `<html><body><header><a href="/th/">หน้าแรก</a><nav><a href="/th/info/">ข่าว</a></nav></header>
<ul class="news-list">
 <li><a href="https://tcg.pokemon.com/en-us/expansions/delta-reign/">Delta Reign, arriving on November 6 Product</a></li>
 <li><a href="/th/archives/8279/">Pokémon TCG: GYM Campaign 2026 Event</a></li>
 <li><a href="/th/archives/8100/"><span class="cat">Product</span><span class="ttl">ชุดเสริมใหม่ วางจำหน่าย 6 พฤศจิกายน 2569</span></a></li>
 <li><a href="/th/archives/8279/">Pokémon TCG: GYM Campaign 2026 Event</a></li>
 <li><a href="https://evil.example.com/x">Click here Product</a></li>
</ul><footer><a href="/th/privacy/">Privacy</a></footer></body></html>`;
exports.DETAIL = (id, extra = '') => `<html><head><title>GYM Campaign ${id} | TRAINERS WEBSITE</title>
<meta property="og:image" content="http://asia.pokemon-card.com/build/images/th/ogp/ogp.png">
<meta property="article:published_time" content="2026-11-05T10:00:00+07:00"></head><body>
<header><h1>TRAINERS WEBSITE</h1></header>
<main><div class="crumb"><a href="/th/info#event">Event</a></div>
<h1>Pokémon TCG: GYM Campaign 2026</h1>
<div class="body"><p>จัดกิจกรรมที่ Central World ระหว่างวันที่ 14 พฤศจิกายน 2026 ถึง 30 พฤศจิกายน 2026</p>
<p>ค่าสมัคร 150 บาท รับจำนวน 64 คน — ตรงเวลา 10:00 น.</p>${extra}</div>
<div class="share">Follow us!</div></main><footer>© Pokémon</footer></body></html>`;
