// แยกข้อมูลการ์ด (asia.pokemon-card.com) และเด็คลิสต์ (limitlesstcg.com / pokecabook.com)
// ออกแบบแบบ "ทนต่อโครงสร้างเปลี่ยน": ใช้ regex/heuristics กับ HTML แทน class ตายตัว
// หมายเหตุ: ผู้พัฒนายังไม่เคยทดสอบกับ HTML จริงทุกหน้า — ให้รัน `node sync-tcg.js --dry-run` ตรวจผลก่อนเปิดใช้งาน
const cheerio = require('cheerio');
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const abs = (href, base) => { try { const u = new URL(href, base); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; } };
const stripTags = s => clean(String(s).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' '));
const meta = ($, k) => $(`meta[property="${k}"],meta[name="${k}"]`).attr('content') || '';

// ================= การ์ด Pokémon Asia (ไทย) =================
// หน้ารายการ → { ids: [14720,...], totalPages }
function parseCardList(html) {
  const ids = [...new Set([...String(html).matchAll(/card-search\/detail\/(\d+)/g)].map(m => Number(m[1])))];
  const m = String(html).match(/ทั้งหมด\s*(\d+)\s*หน้า/);
  return { ids, totalPages: m ? Number(m[1]) : null };
}
const STAGES = ['พื้นฐาน', 'ร่าง 1', 'ร่าง 2', 'VMAX', 'VSTAR', 'เมก้า', 'ร่างพิเศษ'];
const ENERGY_EN = { Grass: 'grass', Fire: 'fire', Water: 'water', Lightning: 'lightning', Psychic: 'psychic', Fighting: 'fighting', Darkness: 'darkness', Metal: 'metal', Fairy: 'fairy', Dragon: 'dragon', Colorless: 'colorless' };

// หน้ารายละเอียด → แถวสำหรับตาราง cards (null ถ้าแยกชื่อ/รูปไม่ได้)
function parseCardDetail(html, url) {
  const $ = cheerio.load(html);
  const idm = String(url).match(/detail\/(\d+)/); if (!idm) return null;
  const sourceId = Number(idm[1]);
  const name = clean(($('title').text() || '').split('|')[0]) || clean(meta($, 'og:title'));
  const h1 = clean($('h1').first().text());
  let stage = null;
  if (h1 && name && h1.endsWith(name) && h1.length > name.length) stage = clean(h1.slice(0, h1.length - name.length));
  else { const s = STAGES.find(x => h1.startsWith(x)); if (s) stage = s; }
  const text = clean($('body').text());
  const hp = (text.match(/HP\s*(\d{2,3})\b/) || [])[1];
  const en = (String($.html('body')).match(/various_images\/energy\/([A-Za-z]+)\.png/) || [])[1];
  const energyType = hp && en ? (ENERGY_EN[en] || en.toLowerCase()) : null;
  const supertype = hp ? 'pokemon' : /พลังงาน/.test(h1 || name) ? 'energy' : 'trainer';
  const num = (text.match(/(?:[A-Z]{1,3}\s)?\d{1,3}\s?\/\s?\d{1,3}/) || [])[0] || null;
  const expA = $('a[href*="expansionCodes="]').first();
  const expansion = (decodeURIComponent((expA.attr('href') || '').match(/expansionCodes=([^&]+)/)?.[1] || '') || null);
  if (!name || name.length > 120) return null;
  return {
    id: 'th-' + sourceId, source_id: sourceId, name, supertype, energy_type: energyType, hp: hp ? Number(hp) : null,
    stage: supertype === 'pokemon' ? stage : null, expansion, expansion_name: clean(expA.text()) || null, number: num,
    image_url: null, source_url: abs(url, url),
  };
}

// ================= Limitless =================
// /decks/<id> → รายการลิงก์ decklist ล่าสุด
function parseLimitlessArchetype(html, base) {
  const $ = cheerio.load(html);
  const name = clean($('h1').first().text()) || clean(meta($, 'og:title').replace(/\s*[-–]\s*Deck Overview.*$/i, ''));
  const urls = [...new Set($('a[href*="/decks/list/"]').map((_, e) => abs($(e).attr('href'), base)).get().filter(Boolean))];
  return { name, listUrls: urls };
}
const pad3 = n => String(n).padStart(3, '0');
function limitlessImg(set, num, size = 'SM') { return /^\d+$/.test(num) ? `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/${set}/${set}_${pad3(num)}_R_EN_${size}.png` : null; }

// /decks/list/<id> → เด็ค 1 รายการ
function parseLimitlessList(html, url) {
  const h = String(html); const $ = cheerio.load(h);
  const title = clean($('title').text()).replace(/\s*[–-]\s*Limitless.*$/i, '');
  const desc = meta($, 'og:description') || meta($, 'description');
  const dm = desc.match(/^(.*?) decklist by (.+?) - (\d+\w{2}) Place (.+?) - (.+)$/i);
  const archetype = dm?.[1] || title.replace(/ by .*$/, '') || null;
  const player = dm?.[2] || (title.match(/ by (.+)$/) || [])[1] || null;
  const placement = dm?.[3] || null, event = dm?.[4] || null;
  let eventDate = null; if (dm?.[5]) { const d = new Date(dm[5].replace(/(\d+)(st|nd|rd|th)/, '$1') + ' UTC'); if (!isNaN(d)) eventDate = d.toISOString().slice(0, 10); }
  // หัวข้อ section ตามตำแหน่งใน HTML
  const heads = [...h.matchAll(/(Pok[eé]mon|Trainer|Energy)\s*\((\d+)\)/g)].map(m => ({ i: m.index, sec: m[1].toLowerCase().startsWith('pok') ? 'pokemon' : m[1].toLowerCase() }));
  const secAt = i => { let s = 'pokemon'; for (const x of heads) if (x.i <= i) s = x.sec; return s; };
  const re = /<a\b[^>]*href="([^"]*\/cards\/([A-Za-z0-9-]+)\/([A-Za-z0-9-]+))"[^>]*>([\s\S]*?)<\/a>/g;
  const imgByRef = new Map(), rows = []; let m;
  while ((m = re.exec(h))) {
    const [, href, set, num, inner] = m; const key = set + '/' + num; const text = stripTags(inner);
    const img = inner.match(/<img[^>]*src="([^"]+_(?:XS|SM|MD)\.png)"/i)?.[1];
    if (img && !imgByRef.has(key)) imgByRef.set(key, img.replace(/_(XS|MD)\.png$/i, '_SM.png'));
    const q = text.match(/^(\d+)\s+(.+)$/);
    if (q && !rows.some(r => r.ref === key)) {
      let name = q[2]; if (name.endsWith(' ' + set)) name = name.slice(0, -set.length - 1);
      rows.push({ q: Number(q[1]), n: name.slice(0, 80), sec: secAt(m.index), set, num, ref: key });
    }
  }
  const cards = rows.map(r => ({ q: r.q, n: r.n, sec: r.sec, set: r.set, num: r.num, img: imgByRef.get(r.ref) || limitlessImg(r.set, r.num) }));
  const total = cards.reduce((a, c) => a + c.q, 0);
  const cover = meta($, 'og:image') || null;
  if (!cards.length) return null;
  return { title: title || archetype, archetype, player, placement, event, eventDate, cover, cards, total, sourceUrl: abs(url, url), format: /standard\.png/i.test(h) ? 'standard' : null };
}
const secLabel = { pokemon: 'Pokémon', trainer: 'Trainer', energy: 'Energy' };
function cardsToText(cards) { // PTCG Live format
  let out = ''; for (const sec of ['pokemon', 'trainer', 'energy']) { const L = cards.filter(c => c.sec === sec); if (!L.length) continue;
    out += `${secLabel[sec]}: ${L.reduce((a, c) => a + c.q, 0)}\n` + L.map(c => `${c.q} ${c.n}${c.set ? ' ' + c.set + (c.num ? ' ' + c.num : '') : ''}`).join('\n') + '\n\n'; }
  return out.trim();
}

// ================= Pokecabook (ญี่ปุ่น) =================
// บทความ 1 หน้า = เด็ค 1 รายการ: ใช้ og:image เป็นภาพรวม + รหัสเด็คทางการ (ถ้ามี)
const DECK_CODE = /\b([0-9A-Za-z]{6}-[0-9A-Za-z]{6}-[0-9A-Za-z]{6})\b/;
function parsePokecabook(html, url) {
  const $ = cheerio.load(html);
  const title = clean(meta($, 'og:title') || $('h1').first().text() || $('title').text()).replace(/\s*[|｜]\s*ポケカ.*$/, '').slice(0, 200);
  const cover = meta($, 'og:image') || null;
  const body = $('article,.entry-content,.post_content,main').first(); const scope = body.length ? body : $('body');
  const code = (clean(scope.text()).match(DECK_CODE) || [])[1] || null;
  const imgs = scope.find('img').map((_, e) => ({ src: abs($(e).attr('data-src') || $(e).attr('src'), url), alt: clean($(e).attr('alt')) })).get()
    .filter(i => i.src && /pokemon-card\.com\/assets\/images\/card_images|card_images/.test(i.src));
  const cards = [...new Map(imgs.map(i => [i.src, { q: 1, n: i.alt || 'card', sec: 'pokemon', img: i.src }])).values()].slice(0, 80);
  const date = meta($, 'article:published_time') || $('time[datetime]').first().attr('datetime') || null;
  if (!title) return null;
  return { title, cover, code, cards, eventDate: date ? date.slice(0, 10) : null, sourceUrl: abs(url, url) };
}

module.exports = { parseCardList, parseCardDetail, parseLimitlessArchetype, parseLimitlessList, parsePokecabook, cardsToText, limitlessImg };
