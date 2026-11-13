// จัดหมวดหมู่: ใช้ป้ายหมวดจากต้นทางก่อน; ถ้าไม่มี/ไม่รู้จัก → ใช้คีย์เวิร์ด; ถ้ายังไม่ได้ → others
const CATEGORIES = ['products', 'events', 'tournaments', 'campaigns', 'announcements', 'columns', 'others'];

// ป้ายหมวดที่พบบนเว็บต้นทาง (EN/TH) → หมวดของเรา
const SOURCE_LABELS = [
  [/^(product|products|สินค้า|ผลิตภัณฑ์)$/i, 'products'],
  [/^(event|events|อีเวนต์|อีเว้นท์|กิจกรรม)$/i, 'events'],
  [/^(tournament|tournaments|การแข่งขัน|แข่งขัน)$/i, 'tournaments'],
  [/^(campaign|campaigns|แคมเปญ)$/i, 'campaigns'],
  [/^(announcement|announcements|notice|news|ประกาศ|ประกาศทั่วไป|ข่าวสาร)$/i, 'announcements'],
  [/^(column|columns|คอลัมน์)$/i, 'columns'],
  [/^(other|others|อื่น ๆ|อื่นๆ)$/i, 'others'],
];
const LABEL_WORDS = ['product', 'products', 'event', 'events', 'tournament', 'tournaments', 'campaign', 'campaigns', 'announcement', 'notice', 'other', 'others', 'column',
  'สินค้า', 'อีเวนต์', 'กิจกรรม', 'การแข่งขัน', 'แคมเปญ', 'ประกาศ', 'ประกาศทั่วไป', 'อื่น ๆ', 'อื่นๆ', 'คอลัมน์'];

const TOURNAMENT_KW = /(championship|tournament|league\s*challenge|league\s*cup|regional|worlds|gym\s*battle|แข่งขัน|แชมเปี้ยน|ลีก|ทัวร์นาเมนต์)/i;
const PRODUCT_KW = /(booster|expansion|starter|deck|collection|theme\s*deck|ex\s*box|บูสเตอร์|เอ็กซ์แพนชัน|ชุดเสริม|สตาร์ทเตอร์|วางจำหน่าย|released?|arriving)/i;
const CAMPAIGN_KW = /(campaign|promo|promotion|แคมเปญ|โปรโมชัน|ของแถม)/i;
const ANNOUNCE_KW = /(announcement|notice|regulation|rule|errata|ประกาศ|กฎ|ข้อกำหนด|แจ้งเตือน)/i;
const EVENT_KW = /(event|campaign|festival|อีเวนต์|กิจกรรม|งาน)/i;

function mapSourceLabel(label) {
  const s = String(label || '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  for (const [re, cat] of SOURCE_LABELS) if (re.test(s)) return cat;
  return null;
}
function categorize(label, title = '') {
  const fromSource = mapSourceLabel(label);
  // "Event" ของต้นทางครอบคลุมการแข่งขันด้วย → ถ้าหัวข้อเป็นการแข่งขันชัดเจน ให้ใช้ tournaments
  if (fromSource === 'events' && TOURNAMENT_KW.test(title)) return 'tournaments';
  if (fromSource) return fromSource;
  if (TOURNAMENT_KW.test(title)) return 'tournaments';
  if (PRODUCT_KW.test(title)) return 'products';
  if (CAMPAIGN_KW.test(title)) return 'campaigns';
  if (ANNOUNCE_KW.test(title)) return 'announcements';
  if (EVENT_KW.test(title)) return 'events';
  return 'others';
}
module.exports = { CATEGORIES, LABEL_WORDS, mapSourceLabel, categorize };
