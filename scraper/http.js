// HTTP client สุภาพกับเว็บต้นทาง: timeout, retry จำกัด, rate limit, จำกัดขนาด, ตรวจ host, เคารพ robots.txt
const cfg = require('./config');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hostAllowed = (host, list) => list.some(h => host === h || host.endsWith('.' + h));

// ---------- robots.txt ----------
function parseRobots(txt, agent) {
  const token = agent.split(/[\/\s]/)[0].toLowerCase();
  const groups = []; let cur = null, lastWasUA = false;
  for (const raw of String(txt).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (k === 'user-agent') {
      if (!lastWasUA) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(v.toLowerCase()); lastWasUA = true;
    } else if ((k === 'allow' || k === 'disallow') && cur) {
      lastWasUA = false; if (v) cur.rules.push({ allow: k === 'allow', pattern: v });
    } else lastWasUA = false;
  }
  const specific = groups.filter(g => g.agents.some(a => a !== '*' && token.includes(a)));
  const chosen = specific.length ? specific : groups.filter(g => g.agents.includes('*'));
  return chosen.flatMap(g => g.rules);
}
function robotsAllows(rules, pathAndQuery) {
  let best = null;
  for (const r of rules) {
    const re = new RegExp('^' + r.pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(pathAndQuery)) {
      const len = r.pattern.length;
      if (!best || len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
    }
  }
  return best ? best.allow : true;
}

class Http {
  constructor(opts = {}) {
    this.o = { ...cfg, ...opts };
    this.last = 0; this.robots = new Map(); this.count = 0;
  }
  async #throttle() {
    const wait = this.last + this.o.delayMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.last = Date.now();
  }
  async #raw(url, { maxRedirects = 3 } = {}) {
    let cur = new URL(url);
    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (cur.protocol !== 'https:' && !(this.o.allowHttp && cur.protocol === 'http:')) throw new Error('blocked non-https URL: ' + cur.href);
      if (!hostAllowed(cur.hostname, this.o.fetchHosts)) throw new Error('blocked host: ' + cur.hostname);
      await this.#throttle(); this.count++;
      const res = await fetch(cur, {
        redirect: 'manual', signal: AbortSignal.timeout(this.o.timeoutMs),
        headers: { 'User-Agent': this.o.userAgent, Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5', 'Accept-Language': 'th,en;q=0.8' },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { cur = new URL(res.headers.get('location'), cur); continue; }
      return { res, finalUrl: cur.href };
    }
    throw new Error('too many redirects');
  }
  async #read(res) {
    const len = Number(res.headers.get('content-length') || 0);
    if (len > this.o.maxBytes) throw new Error('response too large');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > this.o.maxBytes) throw new Error('response too large');
    return buf.toString('utf8');
  }
  // คืน { status, text, url } ; throw เมื่อ retry หมดแล้วยังล้มเหลว (network/5xx/429)
  async get(url, { checkRobots = true } = {}) {
    if (checkRobots && !(await this.allowed(url))) throw Object.assign(new Error('disallowed by robots.txt: ' + url), { robots: true });
    let lastErr;
    for (let attempt = 0; attempt <= this.o.retries; attempt++) {
      try {
        const { res, finalUrl } = await this.#raw(url);
        if (res.status === 429 || res.status >= 500) {
          const ra = Number(res.headers.get('retry-after'));
          lastErr = new Error('HTTP ' + res.status);
          await sleep(Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * (attempt + 1) ** 2, 30000));
          continue;
        }
        return { status: res.status, text: await this.#read(res), url: finalUrl };
      } catch (e) {
        lastErr = e;
        if (/blocked|too large|too many redirects/.test(e.message)) throw e; // ไม่ต้อง retry
        await sleep(1000 * (attempt + 1) ** 2);
      }
    }
    throw lastErr || new Error('request failed');
  }
  async allowed(url) {
    const u = new URL(url);
    if (!this.robots.has(u.origin)) {
      let rules = [];
      try {
        const { res } = await this.#raw(u.origin + '/robots.txt');
        if (res.status >= 200 && res.status < 300) rules = parseRobots(await this.#read(res), this.o.userAgent);
        else if (res.status >= 500) throw new Error('robots.txt HTTP ' + res.status);
        // 4xx = ไม่มี robots.txt → อนุญาต
      } catch (e) { throw new Error('cannot read robots.txt (' + e.message + ') — stopping to be safe'); }
      this.robots.set(u.origin, rules);
    }
    return robotsAllows(this.robots.get(u.origin), u.pathname + u.search);
  }
}
module.exports = { Http, parseRobots, robotsAllows, hostAllowed };
