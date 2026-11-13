// แยกข้อมูลจาก HTML ของเว็บต้นทาง — ออกแบบให้ "ไม่ผูกกับ class/โครงสร้างตายตัว"
// ใช้หลายกลยุทธ์สำรองกัน (heuristics) เพื่อทนต่อการเปลี่ยนโครงสร้างเว็บ
// หมายเหตุ: ยังไม่เคยทดสอบกับ HTML จริงของ asia.pokemon-card.com (ดู README ส่วนข้อจำกัด)
const cheerio = require('cheerio');
const { parseDate } = require('./dates');
const { mapSourceLabel, LABEL_WORDS } = require('./categories');

const ARTICLE_RE = /\/archives\/(\d+)\/?$/;
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const abs = (href, base) => { try { const u = new URL(href, base); return /^https?:$/.test(u.protocol) ? u : null; } catch { return null; } };
const hostOk = (host, hosts) => hosts.some(h => host === h || host.endsWith('.' + h));

// ตัดป้ายหมวดที่ต่อท้าย/นำหน้าข้อความลิงก์ออก เช่น "Delta Reign, arriving on November 6 Product"
function splitLabel(text) {
  const t = clean(text);
  const words = [...LABEL_WORDS].sort((a, b) => b.length - a.length);
  for (const w of words) {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let m = t.match(new RegExp(`^(.*\\S)\\s+(${esc})$`, 'i')); if (m) return { title: m[1], label: m[2] };
    m = t.match(new RegExp(`^(${esc})\\s+(\\S.*)$`, 'i')); if (m && mapSourceLabel(m[1])) return { title: m[2], label: m[1] };
  }
  return { title: t, label: null };
}

// หา "การ์ดของข่าวนี้" โดยไล่ขึ้นไปจนกว่าจะเจอ container ที่มีลิงก์ข่าวอื่นปนอยู่ แล้วถอยกลับมาหนึ่งชั้น
// (กันกรณีที่กล่องครอบทั้งลิสต์ ทำให้ทุกข่าวได้รูป/วันที่/หมวดของข่าวแรก)
function itemScope($, $a, baseUrl) {
  const key = el => { const u = abs($(el).attr('href'), baseUrl); return u ? (u.hash = '', u.href) : null; };
  const self = key($a[0]);
  let scope = $a;
  for (let $p = $a.parent(); $p.length && !$p.is('body,html'); $p = $p.parent()) {
    const others = new Set();
    $p.find('a[href]').each((_, el) => { const k = key(el); if (k && k !== self && ARTICLE_RE.test(new URL(k).pathname)) others.add(k); });
    if (others.size) break;
    scope = $p;
  }
  return scope;
}

function findLabelInItem($, $a, $scope) {
  // 1) element ที่ class มีคำว่า cat/label/tag/type ภายในลิงก์หรือ container ของข่าวนี้
  const scopes = [$a, $scope];
  for (const $s of scopes) {
    let found = null;
    $s.find('[class*="cat"],[class*="label"],[class*="tag"],[class*="type"],[data-category],[data-cat]').each((_, el) => {
      const txt = clean($(el).attr('data-category') || $(el).attr('data-cat') || $(el).text());
      if (!found && txt.length <= 30 && mapSourceLabel(txt)) found = txt;
    });
    if (found) return found;
  }
  return null;
}

function findDateInItem($, $a, $c) {
  const t = $c.find('time[datetime]').first().attr('datetime') || $a.find('time[datetime]').first().attr('datetime');
  const d = parseDate(t) || parseDate($c.find('time').first().text()) || parseDate($c.find('[class*="date"],[class*="time"]').first().text());
  return d;
}

// ---------- หน้ารายการ ----------
function parseList(html, baseUrl, { linkHosts = [], fetchHosts = [] } = {}) {
  const $ = cheerio.load(html);
  const items = new Map();
  $('a[href]').each((_, a) => {
    const $a = $(a);
    const u = abs($a.attr('href'), baseUrl); if (!u) return;
    u.hash = '';
    const isArticle = ARTICLE_RE.test(u.pathname) && hostOk(u.hostname, fetchHosts);
    const rawText = clean($a.find('h1,h2,h3,h4,.title,[class*="title"]').first().text() || $a.text());
    const { title: t1, label: l1 } = splitLabel($a.clone().find('time,[class*="date"]').remove().end().text());
    let title = clean($a.find('h1,h2,h3,h4,[class*="title"]').first().text()) || t1;
    const $scope = itemScope($, $a, baseUrl);
    let label = l1 || findLabelInItem($, $a, $scope);
    if (label && title) title = splitLabel(title).label ? splitLabel(title).title : title;
    if (!title || title.length < 3) return;
    if (!isArticle) {
      // ลิงก์ภายนอก/หน้าอื่น: รับเฉพาะที่มีป้ายหมวดชัดเจน (กันเมนู/footer) และโฮสต์อยู่ใน allowlist
      if (!label || !mapSourceLabel(label) || !hostOk(u.hostname, linkHosts)) return;
    }
    const url = u.href;
    if (items.has(url)) { const it = items.get(url); if (!it.label && label) it.label = label; return; }
    const $img = $scope.find('img').first();
    const img = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src') || ($img.attr('srcset') || '').split(/\s+/)[0] || null;
    items.set(url, {
      url, title: clean(title), label: label || null,
      externalId: isArticle ? `${u.pathname.split('/').filter(Boolean)[0] || 'x'}:${u.pathname.match(ARTICLE_RE)[1]}` : null,
      isArticle, publishedAt: findDateInItem($, $a, $scope), image: img ? (abs(img, baseUrl)?.href || null) : null,
    });
  });
  return [...items.values()];
}

// ---------- ข้อความหลักของหน้ารายละเอียด ----------
const MAIN_SELECTORS = ['article', '.entry-content', '.post-content', '.article-body', '.article_body', '[class*="article"] [class*="body"]', '[class*="detail"]', '#content', 'main', '[role="main"]'];
function mainText($, maxChars) {
  let $m = null;
  for (const sel of MAIN_SELECTORS) { const $x = $(sel).first(); if ($x.length && clean($x.text()).length > 80) { $m = $x; break; } }
  if (!$m) $m = $('body');
  const $c = $m.clone();
  $c.find('script,style,noscript,nav,header,footer,aside,form,iframe,svg,button,[class*="share"],[class*="sns"],[class*="breadcrumb"],[class*="related"]').remove();
  $c.find('br').replaceWith('\n');
  $c.find('td,th').each((_, e) => { $(e).append(' | '); });
  $c.find('p,li,tr,h1,h2,h3,h4,h5,h6,div,section,dt,dd').each((_, e) => { $(e).append('\n'); });
  const text = $c.text().replace(/[ \t ]+/g, ' ').replace(/ ?\| ?\n/g, '\n').replace(/\n\s*\n+/g, '\n').trim();
  return text.slice(0, maxChars);
}

// ---------- หน้ารายละเอียด ----------
function parseDetail(html, url, { maxChars = 6000 } = {}) {
  const $ = cheerio.load(html);
  const meta = (sel, attr = 'content') => clean($(sel).first().attr(attr));
  const siteSuffix = /\s*[|｜–—-]\s*(TRAINERS WEBSITE|Pokémon.*|ポケモン.*)$/i;

  let title = clean($('h1').filter((_, e) => clean($(e).text()).length > 3 && !$(e).closest('header,nav').length).first().text())
    || meta('meta[property="og:title"]').replace(siteSuffix, '') || clean($('title').text()).replace(siteSuffix, '');

  // วันที่เผยแพร่: เฉพาะแหล่งที่ระบุว่าเป็น "วันเผยแพร่" (ไม่กวาดวันที่ในเนื้อหา เพราะมักเป็นวันจัดงาน)
  let publishedAt = parseDate(meta('meta[property="article:published_time"]')) || parseDate(meta('meta[itemprop="datePublished"]'))
    || parseDate(meta('meta[name="date"]')) || parseDate(meta('meta[name="pubdate"]'));
  if (!publishedAt) $('script[type="application/ld+json"]').each((_, s) => {
    if (publishedAt) return; try { const walk = o => { if (!o || publishedAt) return; if (Array.isArray(o)) return o.forEach(walk); if (typeof o === 'object') { if (o.datePublished) publishedAt = parseDate(o.datePublished); Object.values(o).forEach(walk); } }; walk(JSON.parse($(s).html())); } catch { }
  });
  if (!publishedAt) publishedAt = parseDate($('time[datetime]').first().attr('datetime'));
  if (!publishedAt) publishedAt = parseDate($('[class*="date"],[class*="posted"],[class*="publish"]').filter((_, e) => clean($(e).text()).length < 40).first().text());
  if (!publishedAt) { // ข้อความสั้น ๆ รอบ ๆ h1 (พ่อแม่ของ h1)
    const $h = $('h1').first(); if ($h.length) publishedAt = parseDate(clean($h.parent().text()).slice(0, 200).replace(clean($h.text()), ''));
  }

  // หมวดหมู่: breadcrumb/ลิงก์ไป info#event หรือป้ายสั้น ๆ เหนือ h1
  let label = null;
  $('a[href*="/info"]').each((_, a) => { if (label) return; const h = $(a).attr('href') || '', t = clean($(a).text());
    const frag = (h.match(/#([a-z]+)$/i) || [])[1]; if (mapSourceLabel(t)) label = t; else if (frag && mapSourceLabel(frag)) label = frag; });
  if (!label) { const $h = $('h1').first(); [$h.prev(), $h.parent().prev(), $h.prevAll().first()].forEach($p => { if (!label && $p.length) { const t = clean($p.text()); if (t.length <= 30 && mapSourceLabel(t)) label = t; } }); }

  const og = meta('meta[property="og:image"]');
  return { title, publishedAt, label, text: mainText($, maxChars), ogImage: og || null };
}

module.exports = { parseList, parseDetail, splitLabel, mainText, ARTICLE_RE, hostOk };
