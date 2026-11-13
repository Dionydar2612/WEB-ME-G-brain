// ดึงการ์ดจาก Pokémon Card Asia (ไทย) + เด็คลิสต์จาก Limitless / Pokecabook → Supabase
// รัน: node scraper/sync-tcg.js [--cards] [--decks] [--dry-run]   (ไม่ระบุ = ทั้งคู่)
const cfg = require('./config');
const { Http } = require('./http');
const { Db } = require('./db');
const P = require('./tcg-parser');
const { notifyError } = require('./notify');
const log = (...a) => console.log(new Date().toISOString(), ...a);
const T = cfg.tcg;
const enc = encodeURIComponent;

async function syncCards({ http, db, dryRun }) {
  const stats = { listPages: 0, found: 0, inserted: 0, failed: 0 }, problems = [];
  const st = dryRun ? {} : await db.settings().catch(() => ({}));
  let page = Number(st.cards_cursor) > 0 ? Number(st.cards_cursor) : 1;
  const known = new Set();
  if (!dryRun) for (let from = 0; ; from += 1000) {
    const rows = await db.rest('GET', `cards?select=source_id&order=source_id&offset=${from}&limit=1000`); rows.forEach(r => known.add(r.source_id)); if (rows.length < 1000) break;
  }
  const done = new Set(); let total = null, budget = T.maxCardsPerRun, pages = T.maxListPagesPerRun;
  while (budget > 0 && pages-- > 0) {
    const qs = new URLSearchParams({ pageNo: page }); if (T.cardExpansions.length) qs.set('expansionCodes', T.cardExpansions.join(','));
    const r = await http.get(`${T.cardListUrl}?${qs}`); if (r.status !== 200) throw new Error('card list HTTP ' + r.status);
    const { ids, totalPages } = P.parseCardList(r.text); stats.listPages++; total = totalPages || total;
    if (!ids.length) { log('หน้ารายการว่าง → เริ่มรอบใหม่จากหน้า 1'); page = 1; break; }
    stats.found += ids.length;
    for (const id of ids.filter(i => !known.has(i))) {
      if (budget <= 0) break; budget--;
      const url = `https://asia.pokemon-card.com/th/card-search/detail/${id}/`;
      try {
        const d = await http.get(url); if (d.status !== 200) throw new Error('HTTP ' + d.status);
        const row = P.parseCardDetail(d.text, url); if (!row) throw new Error('แยกข้อมูลไม่ได้');
        if (dryRun) console.log(JSON.stringify(row)); else await db.rest('POST', 'cards?on_conflict=source_id', row, 'resolution=merge-duplicates');
        known.add(id); done.add(id); stats.inserted++;
      } catch (e) { done.add(id); stats.failed++; problems.push(`card ${id}: ${e.message}`); }
    }
    // เลื่อน cursor เฉพาะเมื่อทั้งหน้าถูกประมวลผลครบ (ไม่ได้หมดงบกลางหน้า)
    if (ids.every(i => known.has(i) || done.has(i))) { page = total && page >= total ? 1 : page + 1; if (page === 1 && total) break; } else break;
  }
  if (!dryRun) await db.rest('POST', 'scraper_settings?on_conflict=key', { key: 'cards_cursor', value: page, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates');
  log(`การ์ด: อ่านรายการ ${stats.listPages} หน้า, เพิ่มใหม่ ${stats.inserted}, ผิดพลาด ${stats.failed}, ต่อรอบหน้าไปหน้า ${page}`);
  return { ...stats, problems };
}

const hostOf = u => new URL(u).hostname.replace(/^www\./, '');
function deckRow(src, d, extra = {}) {
  const cards = (d.cards || []).map(({ img, image_url, artwork, ...c }) => c);
  return {
    name: String(d.title).slice(0, 160), list: d.cards?.length && d.cards[0].sec ? P.cardsToText(d.cards) || d.title : d.title, is_public: true, user_id: null,
    author_name: d.player || (src === 'pokecabook' ? 'Pokecabook' : 'Limitless'), cards, cover_url: null,
    tags: [...new Set([d.archetype, d.format, src, d.placement && /^(1st|2nd|3rd|4th|5th|6th|7th|8th)$/.test(d.placement) ? 'top8' : null, ...(extra.tags || [])].filter(Boolean).map(t => String(t).toLowerCase().replace(/\s+/g, '-')))],
    format: d.format || null, source: src, source_name: src === 'pokecabook' ? 'Pokecabook' : 'Limitless TCG', source_url: d.sourceUrl,
    player: d.player || null, event: d.event || null, placement: d.placement || null, event_date: d.eventDate || null, deck_code: d.code || null,
  };
}

async function syncDecks({ http, db, dryRun }) {
  const stats = { found: 0, inserted: 0, failed: 0 }, problems = [];
  const known = new Set(), blocked = new Set();
  if (!dryRun) {
    (await db.rest('GET', 'decklists?select=source_url&source_url=not.is.null&limit=5000')).forEach(r => known.add(r.source_url));
    (await db.rest('GET', 'deck_blocklist?select=source_url&limit=5000')).forEach(r => blocked.add(r.source_url));
  }
  const queue = []; // { src, url, tags }
  for (const u of T.deckUrls) {
    try {
      const host = hostOf(u), path = new URL(u).pathname;
      if (host === 'limitlesstcg.com' && /^\/decks\/list\/\d+/.test(path)) queue.push({ src: 'limitless', url: u });
      else if (host === 'limitlesstcg.com' && /^\/decks\/\d+/.test(path)) {
        const r = await http.get(u); if (r.status !== 200) throw new Error('HTTP ' + r.status);
        const a = P.parseLimitlessArchetype(r.text, r.url); log(`${u} → ${a.name}: พบ ${a.listUrls.length} decklist`);
        a.listUrls.forEach(x => queue.push({ src: 'limitless', url: x, tags: [a.name] }));
      } else if (host === 'pokecabook.com') queue.push({ src: 'pokecabook', url: u });
      else problems.push('ไม่รู้จักรูปแบบ URL: ' + u);
    } catch (e) { problems.push(`source ${u}: ${e.message}`); log('ดึงต้นทางไม่สำเร็จ:', u, e.message); }
  }
  const seen = new Set(), fresh = queue.filter(q => !seen.has(q.url) && seen.add(q.url) && !known.has(q.url) && !blocked.has(q.url));
  stats.found = queue.length; log(`เด็คใหม่ ${fresh.length}/${queue.length} (จำกัดรอบละ ${T.maxDecksPerRun})`);
  for (const q of fresh.slice(0, T.maxDecksPerRun)) {
    try {
      const r = await http.get(q.url); if (r.status !== 200) throw new Error('HTTP ' + r.status);
      const d = q.src === 'limitless' ? P.parseLimitlessList(r.text, r.url) : P.parsePokecabook(r.text, r.url);
      if (!d) throw new Error('แยกเด็คไม่ได้ (โครงสร้างหน้าอาจเปลี่ยน)');
      const row = deckRow(q.src, d, q);
      if (dryRun) console.log(JSON.stringify({ ...row, cards: row.cards.length + ' cards', list: row.list.slice(0, 80) + '…' }, null, 1));
      else await db.rest('POST', 'decklists?on_conflict=source_url', row, 'resolution=ignore-duplicates');
      stats.inserted++;
    } catch (e) { stats.failed++; problems.push(`deck ${q.url}: ${e.message}`); log('ข้ามเด็ค:', q.url, e.message); }
  }
  log(`เด็ค: เพิ่มใหม่ ${stats.inserted}, ผิดพลาด ${stats.failed}, requests ${http.count}`);
  return { ...stats, problems };
}

async function run({ cards = true, decks = true, dryRun = false } = {}) {
  cards = cards && T.cardSyncEnabled; decks = decks && T.deckSyncEnabled;
  if (!cards && !decks) { log('ข้ามการซิงก์การ์ด/เด็ค: CARD_SYNC_ENABLED และ DECK_SYNC_ENABLED ปิดอยู่; ตรวจสอบสิทธิ์และเงื่อนไขแหล่งข้อมูลก่อนเปิด'); return { skipped: true, reason: 'TCG_SYNC_DISABLED' }; }
  if (!dryRun && (!cfg.supabaseUrl || !cfg.supabaseServiceKey)) throw new Error('ต้องตั้ง SUPABASE_URL และ SUPABASE_SERVICE_KEY');
  const db = dryRun ? null : new Db(), out = {}, problems = [];
  for (const [name, on, fn] of [['cards', cards, syncCards], ['decks', decks, syncDecks]]) {
    if (!on) continue;
    const http = new Http({ fetchHosts: T.fetchHosts, userAgent: cfg.userAgent });
    try { out[name] = await fn({ http, db, dryRun }); problems.push(...out[name].problems); }
    catch (e) { log(`${name} ล้มเหลว:`, e.message); problems.push(`${name}: ${e.message}`); out[name] = { error: e.message }; }
  }
  if (!dryRun) await db.rest('POST', 'scraper_settings?on_conflict=key', { key: 'tcg_last_run', value: { at: new Date().toISOString(), cards: out.cards, decks: out.decks, problems: problems.slice(0, 20) }, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates').catch(() => { });
  if (Object.values(out).some(o => o.error)) { await notifyError(problems.join('; ')).catch(() => { }); throw new Error(problems.join('; ')); }
  return out;
}
if (require.main === module) {
  const a = process.argv.slice(2), only = a.includes('--cards') || a.includes('--decks');
  run({ cards: !only || a.includes('--cards'), decks: !only || a.includes('--decks'), dryRun: a.includes('--dry-run') }).then(() => process.exit(0)).catch(() => process.exit(1));
}
module.exports = { run, deckRow };
