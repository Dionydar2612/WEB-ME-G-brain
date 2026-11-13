// เข้าถึง Supabase (PostgREST) ด้วย service_role key — ใช้ฝั่งเซิร์ฟเวอร์/GitHub Actions เท่านั้น
const cfg = require('./config');

class Db {
  constructor(url = cfg.supabaseUrl, key = cfg.supabaseServiceKey) { this.url = url; this.key = key; }
  async #req(method, path, body, prefer) {
    const r = await fetch(`${this.url}/rest/v1/${path}`, {
      method, signal: AbortSignal.timeout(20000),
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Supabase ${method} ${path.split('?')[0]} → ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const t = await r.text(); return t ? JSON.parse(t) : null;
  }
  rest(method, path, body, prefer) { return this.#req(method, path, body, prefer); } // ใช้กับตารางใหม่ (cards/decklists)
  async settings() {
    const rows = await this.#req('GET', 'scraper_settings?select=key,value');
    return Object.fromEntries((rows || []).map(r => [r.key, r.value]));
  }
  // source_url ของข่าวที่ scraper ดึงมาแล้ว + แถวที่ยังไม่มีสรุป (ไว้ retry AI)
  async scrapedRows() {
    const out = []; for (let from = 0; ; from += 1000) {
      const rows = await this.#req('GET', `news?select=id,source_url,summary,ai_attempts,title,original_title,category,thumbnail_url,published_at&source_name=not.is.null&order=created_at.desc&offset=${from}&limit=1000`);
      out.push(...rows); if (rows.length < 1000) break;
    } return out;
  }
  async blocklist() {
    const rows = await this.#req('GET', 'news_blocklist?select=source_url&limit=5000'); return new Set((rows || []).map(r => r.source_url));
  }
  async lastRun() {
    const rows = await this.#req('GET', "scraper_runs?select=started_at,finished_at,status&status=in.(success,partial)&order=started_at.desc&limit=1");
    return rows?.[0] || null;
  }
  async startRun(trigger) {
    const rows = await this.#req('POST', 'scraper_runs', { status: 'running', trigger }, 'return=representation'); return rows[0].id;
  }
  async finishRun(id, patch) { await this.#req('PATCH', `scraper_runs?id=eq.${id}`, { finished_at: new Date().toISOString(), ...patch }); }
  async insertNews(row) { // ซ้ำ source_url → ข้าม (ไม่เขียนทับของที่ admin แก้ไว้)
    const rows = await this.#req('POST', 'news?on_conflict=source_url', row, 'resolution=ignore-duplicates,return=representation');
    return rows?.[0] || null;
  }
  async fillSummary(id, patch) { // เติมสรุปเฉพาะแถวที่ยังไม่มีสรุป (ไม่ทับที่ admin แก้)
    await this.#req('PATCH', `news?id=eq.${id}&summary=is.null`, patch);
  }
  async fillThumb(id, url) { await this.#req('PATCH', `news?id=eq.${id}&thumbnail_url=is.null`, { thumbnail_url: url }); } // เติมเฉพาะแถวที่ยังไม่มีรูป
  async bumpAiAttempts(id, n) { await this.#req('PATCH', `news?id=eq.${id}`, { ai_attempts: n }); }
  async clearManualFlag() { await this.#req('POST', 'scraper_settings?on_conflict=key', { key: 'manual_requested_at', value: false, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates'); }
}
module.exports = { Db };
