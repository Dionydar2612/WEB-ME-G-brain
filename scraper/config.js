// ค่าตั้งต้นทั้งหมดของ Scraper อ่านจาก Environment Variables (หรือไฟล์ .env ตอนรันในเครื่อง)
const fs = require('fs'), path = require('path');
for (const f of ['.env', path.join(__dirname, '..', '.env')]) {
  if (!fs.existsSync(f)) continue;
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const env = process.env;
const has = k => env[k] !== undefined && env[k] !== '';
const num = (k, d) => (has(k) && Number.isFinite(Number(env[k]))) ? Number(env[k]) : d;
const bool = (k, d) => has(k) ? /^(1|true|yes|on)$/i.test(env[k]) : d;
const list = (k, d) => has(k) ? env[k].split(',').map(s => s.trim()).filter(Boolean) : d;

module.exports = {
  sourceName: env.SOURCE_NAME || 'Pokémon Card Game Asia',
  listUrls: list('SOURCE_LIST_URLS', ['https://asia.pokemon-card.com/th/info/']),
  // โฮสต์ที่ยอมให้ดึงหน้า (ป้องกัน redirect ไปที่อื่น)
  fetchHosts: list('SOURCE_FETCH_HOSTS', ['asia.pokemon-card.com']),
  // โฮสต์ที่ยอมให้เก็บเป็นลิงก์ต้นฉบับ (ข่าวบางรายการชี้ไปเว็บ Pokémon อื่น)
  linkHosts: list('SOURCE_LINK_HOSTS', ['pokemon-card.com', 'pokemon.com', 'portal-pokemon.com', 'youtube.com', 'youtu.be', 'facebook.com']),
  userAgent: env.SCRAPER_USER_AGENT || 'PokemonTCGNewsAggregator/1.0 (community news aggregator; respects robots.txt)',
  timeoutMs: num('SCRAPER_TIMEOUT_MS', 15000),
  retries: num('SCRAPER_RETRIES', 2),
  delayMs: num('SCRAPER_DELAY_MS', 2000),          // หน่วงระหว่าง request (rate limit)
  maxBytes: num('SCRAPER_MAX_BYTES', 2 * 1024 * 1024),
  maxNewPerRun: num('SCRAPER_MAX_NEW_PER_RUN', 15), // จำกัดจำนวนหน้ารายละเอียดต่อรอบ
  maxAiRetryPerRun: num('SCRAPER_MAX_AI_RETRY', 5),
  // ลิขสิทธิ์: ค่าเริ่มต้น "ไม่" เก็บรูป/เนื้อหาต้นฉบับ จนกว่าจะได้รับสิทธิ์และเปิดเอง
  allowSourceImages: bool('ALLOW_SOURCE_IMAGES', false),
  storeContent: bool('STORE_CONTENT', false),
  supabaseUrl: (env.SUPABASE_URL || '').replace(/\/$/, ''),
  supabaseServiceKey: env.SUPABASE_SERVICE_KEY || '',
  ai: {
    enabled: bool('AI_ENABLED', false),            // ต้องเปิดทั้ง env นี้ และ ai_enabled ในหน้า Admin
    provider: (env.AI_PROVIDER || 'anthropic').toLowerCase(), // anthropic | openai (OpenAI-compatible)
    apiKey: env.AI_API_KEY || '',
    model: env.AI_MODEL || '',
    baseUrl: (env.AI_BASE_URL || '').replace(/\/$/, ''),
    timeoutMs: num('AI_TIMEOUT_MS', 45000),
    maxInputChars: num('AI_MAX_INPUT_CHARS', 6000),
  },
  errorWebhook: env.ERROR_WEBHOOK_URL || '',
};
