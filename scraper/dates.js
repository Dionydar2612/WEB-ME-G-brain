// แปลงข้อความวันที่หลายรูปแบบ (ISO, อังกฤษ, ไทย, พ.ศ.) → ISO string เวลาไทย หรือ null
const TH = { 'ม.ค.': 1, 'มกราคม': 1, 'ก.พ.': 2, 'กุมภาพันธ์': 2, 'มี.ค.': 3, 'มีนาคม': 3, 'เม.ย.': 4, 'เมษายน': 4, 'พ.ค.': 5, 'พฤษภาคม': 5, 'มิ.ย.': 6, 'มิถุนายน': 6,
  'ก.ค.': 7, 'กรกฎาคม': 7, 'ส.ค.': 8, 'สิงหาคม': 8, 'ก.ย.': 9, 'กันยายน': 9, 'ต.ค.': 10, 'ตุลาคม': 10, 'พ.ย.': 11, 'พฤศจิกายน': 11, 'ธ.ค.': 12, 'ธันวาคม': 12 };
const EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const thDigits = s => s.replace(/[๐-๙]/g, d => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(d)));

function build(y, m, d, time) {
  y = Number(y); m = Number(m); d = Number(d);
  if (y > 2400) y -= 543;                                // พ.ศ. → ค.ศ.
  const now = new Date();
  if (y < 2000 || y > now.getUTCFullYear() + 1 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const chk = new Date(Date.UTC(y, m - 1, d));
  if (chk.getUTCMonth() !== m - 1) return null;
  const p = n => String(n).padStart(2, '0');
  return `${y}-${p(m)}-${p(d)}T${time || '00:00:00'}+07:00`;
}

function parseDate(input) {
  if (!input) return null;
  let s = thDigits(String(input)).replace(/\s+/g, ' ').trim();
  let m;
  // ISO / datetime attribute: 2026-11-06 or 2026-11-06T10:00:00+07:00
  if ((m = s.match(/(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?)(Z|[+-]\d{2}:?\d{2})?)?/))) {
    if (m[4] && m[5]) { const d = new Date(m[0].replace(' ', 'T')); if (!isNaN(d)) { const y = d.getUTCFullYear(); return y >= 2000 && y <= new Date().getUTCFullYear() + 1 ? d.toISOString() : null; } }
    return build(m[1], m[2], m[3], m[4] && (m[4].length === 5 ? m[4] + ':00' : m[4]));
  }
  // yyyy/mm/dd , yyyy.mm.dd
  if ((m = s.match(/\b(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})\b/))) return build(m[1], m[2], m[3]);
  // dd/mm/yyyy , dd.mm.yyyy , dd-mm-yyyy  (เอเชีย: วันนำหน้า)
  if ((m = s.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/))) return build(m[3], m[2], m[1]);
  // 6 พฤศจิกายน 2569 / 6 พ.ย. 2569
  const thKeys = Object.keys(TH).sort((a, b) => b.length - a.length).map(k => k.replace(/\./g, '\\.')).join('|');
  if ((m = s.match(new RegExp(`(\\d{1,2})\\s*(${thKeys})\\s*(\\d{4})`)))) return build(m[3], TH[m[2]], m[1]);
  // November 6, 2026 / Nov 6 2026
  if ((m = s.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/))) {
    const mi = EN.indexOf(m[1].slice(0, 3).toLowerCase()); if (mi >= 0) return build(m[3], mi + 1, m[2]);
  }
  // 6 November 2026 / 6 Nov 2026
  if ((m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/))) {
    const mi = EN.indexOf(m[2].slice(0, 3).toLowerCase()); if (mi >= 0) return build(m[3], mi + 1, m[1]);
  }
  return null;
}
module.exports = { parseDate };
