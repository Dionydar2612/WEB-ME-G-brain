// แจ้งข้อผิดพลาด: (1) job ล้มเหลว → GitHub Actions ส่งอีเมลแจ้งเจ้าของ repo อัตโนมัติ
// (2) ถ้าตั้ง ERROR_WEBHOOK_URL (Discord/Slack/อื่น ๆ ที่รับ JSON) จะส่งข้อความไปที่นั่นด้วย
const cfg = require('./config');
async function notifyError(message) {
  if (!cfg.errorWebhook) return;
  const text = `⚠️ Pokémon news scraper ผิดพลาด: ${String(message).slice(0, 500)}`;
  await fetch(cfg.errorWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ text, content: text }) });
}
module.exports = { notifyError };
