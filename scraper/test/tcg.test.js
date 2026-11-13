const test = require('node:test'), assert = require('node:assert/strict');
const F = require('./tcg.fixtures'), P = require('../tcg-parser'), { deckRow } = require('../sync-tcg');

test('parseCardList: id ไม่ซ้ำ + จำนวนหน้า', () => {
  const r = P.parseCardList(F.CARD_LIST); assert.deepEqual(r.ids, [14720, 14721]); assert.equal(r.totalPages, 10);
});
test('parseCardDetail: ชื่อ/HP/ประเภท/รูป/ชุด/นักวาด', () => {
  const r = P.parseCardDetail(F.CARD_DETAIL, 'https://asia.pokemon-card.com/th/card-search/detail/14720/');
  assert.equal(r.id, 'th-14720'); assert.equal(r.name, 'ทามะทามะ'); assert.equal(r.stage, 'พื้นฐาน'); assert.equal(r.hp, 60);
  assert.equal(r.energy_type, 'grass'); assert.equal(r.supertype, 'pokemon'); assert.equal(r.expansion, 'MA6'); assert.equal(r.number, 'J 001/130');
  assert.equal(r.illustrator, 'Nelnal'); assert.equal(r.image_url, 'https://asia.pokemon-card.com/th/card-img/th00014720.png'); assert.match(r.flavor, /โทรจิต/);
});
test('parseLimitlessArchetype: ลิงก์ decklist ไม่ซ้ำ', () => {
  const r = P.parseLimitlessArchetype(F.LL_ARCH, 'https://limitlesstcg.com/decks/284');
  assert.equal(r.name, 'Dragapult'); assert.deepEqual(r.listUrls, ['https://limitlesstcg.com/decks/list/29678', 'https://limitlesstcg.com/decks/list/31083']);
});
test('parseLimitlessList: section/จำนวน/รูป/ผู้เล่น/อันดับ', () => {
  const d = P.parseLimitlessList(F.LL_LIST, 'https://limitlesstcg.com/decks/list/29678');
  assert.equal(d.player, 'Demi Eaton'); assert.equal(d.placement, '104th'); assert.equal(d.event, 'Regional Frankfurt'); assert.equal(d.eventDate, '2026-09-26');
  assert.equal(d.cover, 'https://s3.limitlesstcg.com/decklists/29678.png'); assert.equal(d.cards.length, 6); assert.equal(d.total, 19);
  const by = Object.fromEntries(d.cards.map(c => [c.n, c])); assert.equal(by['Dreepy'].sec, 'pokemon'); assert.equal(by["Boss's Orders"].sec, 'trainer'); assert.equal(by['Fire Energy'].sec, 'energy');
  assert.match(by['Dreepy'].img, /TWM_128_R_EN_SM\.png$/); assert.match(by['Budew'].img, /ASC_016_R_EN_SM\.png$/);
  assert.match(P.cardsToText(d.cards), /^Pokémon: 9\n4 Dreepy TWM 128/);
});
test('parseLimitlessList: ไม่มีการ์ด → null', () => assert.equal(P.parseLimitlessList('<html></html>', 'https://limitlesstcg.com/decks/list/1'), null));
test('parsePokecabook: หัวข้อ/ภาพรวม/รหัสเด็ค/วันที่', () => {
  const d = P.parsePokecabook(F.PCB, 'https://pokecabook.com/archives/1417');
  assert.equal(d.title, '【デッキレシピ】ドラパルトex'); assert.equal(d.cover, 'https://pokecabook.com/wp-content/uploads/x.jpg');
  assert.equal(d.code, 'abc123-defG45-hij678'); assert.equal(d.eventDate, '2026-10-01'); assert.equal(d.cards.length, 1);
});
test('deckRow: แท็ก/แหล่งที่มา และตัดรูปเมื่อปิด ALLOW_DECK_IMAGES', () => {
  const d = P.parseLimitlessList(F.LL_LIST, 'https://limitlesstcg.com/decks/list/29678');
  const r = deckRow('limitless', d, { tags: ['Dragapult'] });
  assert.equal(r.source, 'limitless'); assert.equal(r.user_id, null); assert.ok(r.tags.includes('dragapult') && r.tags.includes('standard') && r.tags.includes('limitless'));
  assert.equal(r.source_url, 'https://limitlesstcg.com/decks/list/29678'); assert.match(r.list, /Trainer: 7/);
});
