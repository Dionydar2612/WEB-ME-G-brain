const test = require('node:test'), assert = require('node:assert/strict'), http = require('node:http');
const F = require('./fixtures');
const { parseDate } = require('../dates');
const { categorize } = require('../categories');
const { parseList, parseDetail } = require('../parser');
const { parseRobots, robotsAllows } = require('../http');
const { numbersGrounded } = require('../ai');
const cfg = require('../config');

test('parseDate: ISO / อังกฤษ / ไทย / พ.ศ. / dd/mm/yyyy', () => {
  assert.equal(parseDate('2026-11-05T10:00:00+07:00'), '2026-11-05T03:00:00.000Z');
  assert.equal(parseDate('2026-11-06'), '2026-11-06T00:00:00+07:00');
  assert.equal(parseDate('November 6, 2026'), '2026-11-06T00:00:00+07:00');
  assert.equal(parseDate('6 Nov 2026'), '2026-11-06T00:00:00+07:00');
  assert.equal(parseDate('6 พฤศจิกายน 2569'), '2026-11-06T00:00:00+07:00');
  assert.equal(parseDate('๖ พ.ย. ๒๕๖๙'), '2026-11-06T00:00:00+07:00');
  assert.equal(parseDate('06/11/2026'), '2026-11-06T00:00:00+07:00');
  assert.equal(parseDate('2026.11.06'), '2026-11-06T00:00:00+07:00');
  assert.equal(parseDate('31/02/2026'), null);
  assert.equal(parseDate('hello'), null);
});
test('categorize: ใช้ป้ายต้นทางก่อน, fallback คีย์เวิร์ด, ไม่รู้ → others', () => {
  assert.equal(categorize('Product', 'x'), 'products');
  assert.equal(categorize('Campaign', 'x'), 'campaigns');
  assert.equal(categorize('Column', 'x'), 'columns');
  assert.equal(categorize('Other', 'x'), 'others');
  assert.equal(categorize('Event', 'Championship Point system'), 'tournaments');
  assert.equal(categorize('Event', 'GYM Campaign'), 'events');
  assert.equal(categorize(null, 'ประกาศเปลี่ยนแปลงกฎ'), 'announcements');
  assert.equal(categorize(null, 'เรื่องทั่วไป'), 'others');
  assert.equal(categorize('???', 'เรื่องทั่วไป'), 'others');
});
test('parseList: ดึง archives + ลิงก์ภายนอกที่ปลอดภัย, ตัดป้ายหมวด, กันซ้ำ, ไม่เอา host แปลก/เมนู', () => {
  const r = parseList(F.LIST, 'https://asia.pokemon-card.com/th/info/', { linkHosts: cfg.linkHosts, fetchHosts: cfg.fetchHosts });
  const by = Object.fromEntries(r.map(i => [i.url, i]));
  assert.equal(r.length, 3);
  assert.equal(by['https://asia.pokemon-card.com/th/archives/8279/'].title, 'Pokémon TCG: GYM Campaign 2026');
  assert.equal(by['https://asia.pokemon-card.com/th/archives/8279/'].label, 'Event');
  assert.equal(by['https://asia.pokemon-card.com/th/archives/8279/'].externalId, 'th:8279');
  assert.equal(by['https://asia.pokemon-card.com/th/archives/8100/'].label, 'Product');
  assert.match(by['https://asia.pokemon-card.com/th/archives/8100/'].title, /ชุดเสริมใหม่/);
  const ext = by['https://tcg.pokemon.com/en-us/expansions/delta-reign/'];
  assert.equal(ext.title, 'Delta Reign, arriving on November 6'); assert.equal(ext.isArticle, false);
});
test('parseList: ลิสต์อยู่ในกล่องเดียวกัน ทุกข่าวต้องได้รูปของตัวเอง (บั๊กรูปซ้ำ)', () => {
  const html = `<div class="list"><div class="card"><a href="/th/archives/1/"><img src="/img/a.jpg"><p>ข่าว A</p></a><span class="label">Product</span></div>
    <div class="card"><a href="/th/archives/2/"><img data-src="/img/b.jpg"><p>ข่าว B</p></a><span class="label">Event</span></div>
    <div class="card"><div><img src="/img/c.jpg"></div><div><a href="/th/archives/3/">ข่าว C</a><span class="label">Other</span></div></div></div>`;
  const r = Object.fromEntries(parseList(html, 'https://asia.pokemon-card.com/th/info/', { linkHosts: cfg.linkHosts, fetchHosts: cfg.fetchHosts }).map(i => [i.externalId, i]));
  assert.equal(r['th:1'].image, 'https://asia.pokemon-card.com/img/a.jpg'); assert.equal(r['th:1'].label, 'Product');
  assert.equal(r['th:2'].image, 'https://asia.pokemon-card.com/img/b.jpg'); assert.equal(r['th:2'].label, 'Event');
  assert.equal(r['th:3'].image, 'https://asia.pokemon-card.com/img/c.jpg'); assert.equal(r['th:3'].label, 'Other');
});
test('parseDetail: หัวข้อ/วันที่เผยแพร่/หมวด/ข้อความ (ไม่รวม header/footer/share)', () => {
  const d = parseDetail(F.DETAIL(1), 'https://asia.pokemon-card.com/th/archives/1/');
  assert.equal(d.title, 'Pokémon TCG: GYM Campaign 2026');
  assert.equal(d.publishedAt, '2026-11-04T20:00:00.000Z'.replace('T20', 'T03').replace('11-04', '11-05'));
  assert.equal(d.label, 'Event');
  assert.match(d.text, /Central World/); assert.doesNotMatch(d.text, /Follow us|©/);
});
test('parseDetail: ไม่มี meta วันที่ → null (ไม่เอาวันจัดงานในเนื้อหามาเป็นวันเผยแพร่)', () => {
  const html = F.DETAIL(2).replace(/<meta property="article:published_time"[^>]*>/, '');
  assert.equal(parseDetail(html, 'https://x/th/archives/2/').publishedAt, null);
});
test('robots.txt parser', () => {
  const rules = parseRobots('User-agent: *\nDisallow: /private/\nAllow: /private/ok\nDisallow: /*.pdf$\n', 'PokemonTCGNewsAggregator/1.0');
  assert.equal(robotsAllows(rules, '/th/info/'), true);
  assert.equal(robotsAllows(rules, '/private/x'), false);
  assert.equal(robotsAllows(rules, '/private/ok'), true);
  assert.equal(robotsAllows(rules, '/a/b.pdf'), false);
  const all = parseRobots('User-agent: *\nDisallow: /', 'bot'); assert.equal(robotsAllows(all, '/th/info/'), false);
});
test('AI guard: ตัวเลขที่ไม่มีในต้นฉบับถูกปฏิเสธ', () => {
  const src = 'ค่าสมัคร 150 บาท 64 คน 14 พฤศจิกายน 2026';
  assert.equal(numbersGrounded('ค่าสมัคร 150 บาท รับ 64 คน วันที่ 14 พ.ย. 2026', src), true);
  assert.equal(numbersGrounded('ค่าสมัคร 200 บาท', src), false);
  assert.equal(numbersGrounded('ปี 2569', src), false);
});

// ---------- end-to-end กับเซิร์ฟเวอร์จำลอง (เว็บต้นทาง + Supabase REST) ----------
function startMock() {
  const db = { news: [], runs: [], settings: { interval_minutes: 30, ai_enabled: true, auto_publish: true, manual_requested_at: false }, blocklist: [] };
  const src = { fail: false, hits: [], noDate: false };
  const sourceSrv = http.createServer((q, s) => {
    src.hits.push(q.url);
    if (q.url === '/robots.txt') { s.end('User-agent: *\nDisallow: /th/private/\n'); return; }
    if (src.fail) { s.statusCode = 503; s.end('down'); return; }
    if (q.url === '/th/info/') { s.setHeader('content-type', 'text/html'); s.end(F.LIST); return; }
    const m = q.url.match(/^\/th\/archives\/(\d+)\/$/); if (m) { s.end(src.noDate ? F.DETAIL(m[1]).replace(/<meta property="article:published_time"[^>]*>/, '') : F.DETAIL(m[1])); return; }
    s.statusCode = 404; s.end('nf');
  });
  const sbSrv = http.createServer((q, s) => {
    let b = ''; q.on('data', c => b += c); q.on('end', () => {
      const u = new URL(q.url, 'http://x'), t = u.pathname.replace('/rest/v1/', ''), body = b ? JSON.parse(b) : null;
      const send = (o, code = 200) => { s.statusCode = code; s.setHeader('content-type', 'application/json'); s.end(JSON.stringify(o)); };
      if (t === 'scraper_settings' && q.method === 'GET') return send(Object.entries(db.settings).map(([key, value]) => ({ key, value })));
      if (t === 'scraper_settings') { db.settings[body.key] = body.value; return send(null); }
      if (t === 'news_blocklist') return send(db.blocklist.map(source_url => ({ source_url })));
      if (t === 'scraper_runs' && q.method === 'GET') return send(db.runs.filter(r => ['success', 'partial'].includes(r.status)).slice(-1));
      if (t === 'scraper_runs' && q.method === 'POST') { const r = { id: 'r' + (db.runs.length + 1), started_at: new Date().toISOString(), ...body }; db.runs.push(r); return send([r], 201); }
      if (t === 'scraper_runs') { Object.assign(db.runs.find(r => 'eq.' + r.id === u.searchParams.get('id')), body); return send(null); }
      if (t === 'news' && q.method === 'GET') return send(db.news.filter(n => n.source_name));
      if (t === 'news' && q.method === 'POST') { if (db.news.some(n => n.source_url === body.source_url)) return send([]); const r = { id: 'n' + (db.news.length + 1), ...body }; db.news.push(r); return send([r], 201); }
      if (t === 'news') { const n = db.news.find(x => 'eq.' + x.id === u.searchParams.get('id')); if (n && (u.searchParams.get('summary') !== 'is.null' || !n.summary)) Object.assign(n, body); return send(null); }
      send({ message: 'unhandled ' + t }, 500);
    });
  });
  return new Promise(res => sourceSrv.listen(0, '127.0.0.1', () => sbSrv.listen(0, '127.0.0.1', () => res({ db, src,
    srcUrl: 'http://127.0.0.1:' + sourceSrv.address().port, sbUrl: 'http://127.0.0.1:' + sbSrv.address().port, close() { sourceSrv.close(); sbSrv.close(); } }))));
}

test('end-to-end (mock): เพิ่มข่าวใหม่, ไม่ซ้ำรอบสอง, ข้ามตาม interval, พังแล้วคงข่าวเดิม, blocklist', async () => {
  const m = await startMock();
  Object.assign(cfg, { listUrls: [m.srcUrl + '/th/info/'], fetchHosts: ['127.0.0.1'], linkHosts: ['pokemon.com', 'pokemon-card.com'], delayMs: 0, retries: 0, supabaseUrl: m.sbUrl, supabaseServiceKey: 'k' });
  cfg.ai.enabled = false;
  const { Http } = require('../http'), { Db } = require('../db'), { run } = require('../index');
  const mk = () => ({ http: new Http({ allowHttp: true, fetchHosts: ['127.0.0.1'], delayMs: 0, retries: 0 }), db: new Db(m.sbUrl, 'k') });
  try {
    let r = await run({ force: true, ...mk() });
    assert.equal(r.status, 'success'); assert.equal(r.found, 3); assert.equal(r.inserted, 3);
    const n = m.db.news.find(x => x.external_id === 'th:8279');
    assert.equal(n.category, 'events'); assert.equal(n.published_at, '2026-11-04T20:00:00.000Z'.replace('11-04T20', '11-05T03')); assert.equal(n.thumbnail_url, null);
    assert.equal(n.summary, null); assert.equal(n.status, 'published'); assert.equal(n.content, null);
    assert.ok(m.db.news.every(x => x.source_name && x.source_url));
    // รอบสอง: ไม่ซ้ำ
    r = await run({ force: true, ...mk() }); assert.equal(r.inserted, 0); assert.equal(m.db.news.length, 3);
    // interval: ไม่ force → ข้าม
    r = await run({ ...mk() }); assert.equal(r.skipped, true);
    // manual request: ข้าม interval + เคลียร์ flag
    m.db.settings.manual_requested_at = new Date().toISOString();
    r = await run({ ...mk() }); assert.equal(r.skipped, undefined); assert.equal(m.db.settings.manual_requested_at, false);
    // blocklist (admin ลบแล้ว): ไม่ดึงกลับ
    m.db.news.splice(m.db.news.findIndex(x => x.external_id === 'th:8100'), 1); m.db.blocklist.push(m.srcUrl + '/th/archives/8100/');
    await run({ force: true, ...mk() }); assert.equal(m.db.news.length, 2);
    // ต้นทางล่ม: throw, ข่าวเดิมอยู่, log เป็น error
    m.src.fail = true; const before = m.db.news.length;
    await assert.rejects(run({ force: true, ...mk() }), /ไม่พบรายการข่าว/);
    assert.equal(m.db.news.length, before); assert.equal(m.db.runs.at(-1).status, 'error');
  } finally { m.close(); }
});
test('end-to-end: robots.txt ห้าม → ไม่ดึง', async () => {
  const m = await startMock(); const { Http } = require('../http');
  try {
    const h = new Http({ allowHttp: true, fetchHosts: ['127.0.0.1'], delayMs: 0, retries: 0 });
    await assert.rejects(h.get(m.srcUrl + '/th/private/x'), /robots/);
    assert.equal((await h.get(m.srcUrl + '/th/info/')).status, 200);
  } finally { m.close(); }
});

test('ข่าวไม่มีวันที่: เรียงตามลำดับหน้าต้นทาง (ใหม่สุดอยู่บน) แม้ดึงคนละรอบ', async () => {
  const m = await startMock(); m.src.noDate = true;
  Object.assign(cfg, { listUrls: [m.srcUrl + '/th/info/'], fetchHosts: ['127.0.0.1'], linkHosts: ['pokemon.com'], delayMs: 0, retries: 0, supabaseUrl: m.sbUrl, supabaseServiceKey: 'k', maxNewPerRun: 1 });
  cfg.ai.enabled = false; const { Http } = require('../http'), { Db } = require('../db'), { run } = require('../index');
  const mk = () => ({ http: new Http({ allowHttp: true, fetchHosts: ['127.0.0.1'], delayMs: 0, retries: 0 }), db: new Db(m.sbUrl, 'k') });
  try {
    for (let i = 0; i < 3; i++) await run({ force: true, ...mk() }); // จำกัดรอบละ 1 ข่าว → ต้องไล่จากใหม่ไปเก่า
    const ts = ['th:8279', 'th:8100'].map(id => Date.parse(m.db.news.find(n => n.external_id === id).published_at));
    assert.ok(ts[0] > ts[1], 'ข่าวที่อยู่บนสุดของต้นทางต้องมีเวลาใหม่กว่า');
  } finally { cfg.maxNewPerRun = 15; m.close(); }
});
