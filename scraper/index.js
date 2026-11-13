// Orchestrator: ตรวจข่าวใหม่ → ดึงรายละเอียด → จัดหมวด → (AI สรุป) → บันทึก Supabase
// รันด้วย: node scraper/index.js [--dry-run] [--force]
//   --dry-run  ดึงและแยกข้อมูลแล้วพิมพ์ผล ไม่เขียนฐานข้อมูล (ไม่ต้องมี SUPABASE_*)
//   --force    ข้ามเงื่อนไขช่วงเวลา (interval)
const cfg = require('./config');
const { Http } = require('./http');
const { parseList, parseDetail, hostOk } = require('./parser');
const { categorize } = require('./categories');
const ai = require('./ai');
const { Db } = require('./db');
const { notifyError } = require('./notify');

const log = (...a) => console.log(new Date().toISOString(), ...a);
const safeLink = u => { try { const x = new URL(u); return x.protocol === 'https:' && hostOk(x.hostname, cfg.linkHosts); } catch { return false; } };
const safeImage = u => { try { return new URL(u).protocol === 'https:'; } catch { return false; } };

async function run({ dryRun = false, force = false, http = new Http(), db = dryRun ? null : new Db(), trigger = 'cli' } = {}) {
  const stats = { found: 0, inserted: 0, summarized: 0, failed: 0 };
  const problems = [];
  let runId = null, settings = {}, existing = [], blocked = new Set();

  if (!dryRun) {
    if (!cfg.supabaseUrl || !cfg.supabaseServiceKey) throw new Error('ต้องตั้ง SUPABASE_URL และ SUPABASE_SERVICE_KEY');
    settings = await db.settings().catch(e => { log('อ่าน settings ไม่ได้ ใช้ค่าเริ่มต้น:', e.message); return {}; });
    const interval = Number(settings.interval_minutes) > 0 ? Number(settings.interval_minutes) : 30;
    const manual = typeof settings.manual_requested_at === 'string';
    const last = await db.lastRun().catch(() => null);
    // cron ของ GitHub เหลื่อมเวลาได้ → เผื่อ 5 นาที เพื่อไม่ให้ข้ามรอบโดยไม่ตั้งใจ
    if (!force && !manual && last && (Date.now() - new Date(last.started_at).getTime()) < (interval - 5) * 60000) {
      log(`ข้ามรอบนี้: ยังไม่ถึงช่วงตรวจสอบ (${interval} นาที)`); return { skipped: true, ...stats };
    }
    if (manual) trigger = 'manual'; else if (process.env.GITHUB_EVENT_NAME === 'schedule') trigger = 'schedule';
    runId = await db.startRun(trigger);
    existing = await db.scrapedRows(); blocked = await db.blocklist();
  }
  const known = new Map(existing.map(r => [r.source_url, r]));
  const aiOn = ai.enabled() && (dryRun ? true : settings.ai_enabled !== false);
  const autoPublish = dryRun ? true : settings.auto_publish !== false;
  log(`เริ่มตรวจข่าว (trigger=${trigger}, AI=${aiOn ? 'on' : 'off'}${dryRun ? ', dry-run' : ''})`);

  try {
    // 1) รายการข่าว
    let items = [];
    for (const url of cfg.listUrls) {
      try {
        const r = await http.get(url);
        if (r.status !== 200) throw new Error('HTTP ' + r.status);
        const found = parseList(r.text, r.url, cfg);
        log(`${url} → พบ ${found.length} รายการ (มีรูป ${found.filter(i => i.image).length}, มีวันที่ ${found.filter(i => i.publishedAt).length}, มีหมวด ${found.filter(i => i.label).length})`);
        if (found[0]) log('ตัวอย่างรายการแรก:', JSON.stringify({ title: found[0].title, label: found[0].label, image: found[0].image }));
        items.push(...found);
      } catch (e) { problems.push(`list ${url}: ${e.message}`); log('ดึงรายการไม่สำเร็จ:', url, e.message); }
    }
    if (!items.length) throw new Error('ไม่พบรายการข่าวเลย — เว็บต้นทางอาจเข้าไม่ได้หรือเปลี่ยนโครงสร้าง HTML (' + problems.join('; ') + ')');
    const seen = new Set(); items = items.filter(i => !seen.has(i.url) && seen.add(i.url));
    stats.found = items.length;

    // 2) คัดเฉพาะข่าวใหม่ (ไม่ซ้ำ, ไม่ถูก admin ลบ, ลิงก์ปลอดภัย)
    const fresh = items.filter(i => !known.has(i.url) && !blocked.has(i.url) && (i.isArticle || safeLink(i.url)));
    log(`ข่าวใหม่ ${fresh.length} รายการ (จำกัดรอบละ ${cfg.maxNewPerRun})`);

    // 2.5) เติมรูปให้ข่าวเดิมที่ยังไม่มีรูป (เมื่อเปิด ALLOW_SOURCE_IMAGES) — ไม่ทับรูปที่มีอยู่
    log(`ALLOW_SOURCE_IMAGES=${cfg.allowSourceImages}`);
    let thumbsFilled = 0;
    if (cfg.allowSourceImages && !dryRun) for (const it of items) {
      const row = known.get(it.url);
      if (row && !row.thumbnail_url && it.image && safeImage(it.image)) await db.fillThumb(row.id, it.image).then(() => thumbsFilled++).catch(e => problems.push('thumb ' + it.url + ': ' + e.message));
    }

    if (cfg.allowSourceImages && !dryRun) log(`เติมรูปให้ข่าวเดิม ${thumbsFilled} รายการ`);
    // 3) ประมวลผลข่าวใหม่
    // ข่าวที่หาวันที่เผยแพร่ไม่เจอ: ใช้ "ลำดับในหน้าต้นทาง" (ใหม่สุดอยู่บน) โดยตั้งเวลาให้ถัดจากข่าวที่อยู่เหนือมันในลิสต์ 1 วินาที
    const tsByUrl = new Map(existing.filter(r => r.published_at).map(r => [r.source_url, Date.parse(r.published_at)]));
    const orderTs = it => { let ts = Date.now();
      for (let i = items.indexOf(it) - 1; i >= 0; i--) { const t = tsByUrl.get(items[i].url); if (t) { ts = t - 1000; break; } }
      return ts; };
    for (const it of fresh.slice(0, cfg.maxNewPerRun)) {
      try {
        let d = null;
        if (it.isArticle) {
          try { const r = await http.get(it.url); if (r.status === 200) d = parseDetail(r.text, r.url, { maxChars: cfg.ai.maxInputChars }); else throw new Error('HTTP ' + r.status); }
          catch (e) { problems.push(`detail ${it.url}: ${e.message}`); log('ดึงรายละเอียดไม่สำเร็จ ใช้ข้อมูลจากหน้ารายการแทน:', it.url, e.message); }
        }
        const originalTitle = (d?.title || it.title).slice(0, 300);
        const category = categorize(d?.label || it.label, originalTitle);
        const imgSrc = cfg.allowSourceImages ? (it.image || (d?.ogImage && !/\/ogp\.(png|jpg)$/i.test(d.ogImage) ? d.ogImage : null)) : null;
        let summary = null, titleTh = null;
        if (aiOn && d?.text) {
          try { ({ summary, titleTh } = await ai.summarize({ title: originalTitle, text: d.text, category })); stats.summarized++; }
          catch (e) { problems.push(`ai ${it.url}: ${e.message}`); log('AI สรุปไม่สำเร็จ (แสดงหัวข้อ+ลิงก์แทน):', e.message); }
        }
        const row = {
          title: titleTh || originalTitle, original_title: originalTitle, summary, ai_generated: !!summary, ai_attempts: aiOn && d?.text ? 1 : 0,
          content: cfg.storeContent && d?.text ? d.text : null, category,
          thumbnail_url: imgSrc && safeImage(imgSrc) ? imgSrc : null,
          source_name: cfg.sourceName, source_url: it.url, external_id: it.externalId,
          published_at: d?.publishedAt || it.publishedAt || new Date(orderTs(it)).toISOString(), fetched_at: new Date().toISOString(),
          status: autoPublish ? 'published' : 'pending', user_id: null,
        };
        tsByUrl.set(it.url, Date.parse(row.published_at));
        if (dryRun) { console.log(JSON.stringify({ ...row, content: row.content && row.content.slice(0, 80) + '…', _textPreview: d?.text?.slice(0, 160) }, null, 2)); stats.inserted++; }
        else if (await db.insertNews(row)) stats.inserted++;
      } catch (e) { stats.failed++; problems.push(`item ${it.url}: ${e.message}`); log('ข้ามรายการที่ผิดพลาด:', it.url, e.message); }
    }

    // 4) retry AI ให้ข่าวที่ยังไม่มีสรุป (เมื่อ AI กลับมาใช้ได้)
    if (aiOn && !dryRun) {
      const todo = existing.filter(r => !r.summary && (r.ai_attempts || 0) < 3 && r.source_url && /\/archives\/\d+\/?$/.test(r.source_url)).slice(0, cfg.maxAiRetryPerRun);
      for (const r of todo) {
        try {
          const res = await http.get(r.source_url); if (res.status !== 200) throw new Error('HTTP ' + res.status);
          const d = parseDetail(res.text, res.url, { maxChars: cfg.ai.maxInputChars });
          const { summary, titleTh } = await ai.summarize({ title: r.original_title || r.title, text: d.text, category: r.category });
          await db.fillSummary(r.id, { summary, ai_generated: true, ai_attempts: (r.ai_attempts || 0) + 1, ...(titleTh ? { title: titleTh } : {}) });
          stats.summarized++;
        } catch (e) { problems.push(`ai-retry ${r.source_url}: ${e.message}`); await db.bumpAiAttempts(r.id, (r.ai_attempts || 0) + 1).catch(() => { }); }
      }
    }

    const status = problems.length ? 'partial' : 'success';
    log(`เสร็จสิ้น: พบ ${stats.found}, เพิ่มใหม่ ${stats.inserted}, สรุปด้วย AI ${stats.summarized}, ผิดพลาด ${stats.failed}, requests ${http.count}`);
    if (!dryRun) { await db.finishRun(runId, { status, ...stats, details: { problems: problems.slice(0, 30), requests: http.count } }); if (typeof settings.manual_requested_at === 'string') await db.clearManualFlag().catch(() => { }); }
    return { status, ...stats, problems };
  } catch (e) {
    log('ผิดพลาด:', e.message);
    if (!dryRun && runId) await db.finishRun(runId, { status: 'error', ...stats, error: e.message.slice(0, 1000), details: { problems: problems.slice(0, 30) } }).catch(() => { });
    await notifyError(e.message).catch(() => { });
    throw e; // ข่าวเดิมในฐานข้อมูลไม่ถูกแตะ; exit code ≠ 0 ทำให้ GitHub Actions แจ้งเตือน
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  run({ dryRun: args.includes('--dry-run'), force: args.includes('--force') })
    .then(() => process.exit(0)).catch(() => process.exit(1));
}
module.exports = { run };
