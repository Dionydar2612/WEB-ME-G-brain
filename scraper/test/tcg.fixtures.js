// HTML จำลองตามโครงสร้างที่สังเกตได้จากหน้าจริง (ไม่ใช่ HTML จริง 100%)
exports.CARD_LIST = `<html><body><p>199 รายการ หน้าที่ 1 / ทั้งหมด 10 หน้า</p><ul>
<li><a href="/th/card-search/detail/14720/"><img src="/th/card-img/th00014720.png"></a></li>
<li><a href="/th/card-search/detail/14721/">x</a></li><li><a href="/th/card-search/detail/14720/">dup</a></li></ul></body></html>`;
exports.CARD_DETAIL = `<html><head><title>ทามะทามะ | เว็บไซต์เทรนเนอร์</title></head><body>
<h1>พื้นฐาน ทามะทามะ</h1><img src="/th/card-img/th00014720.png">
<div>HP 60 / ประเภท <img src="https://asia.pokemon-card.com/various_images/energy/Grass.png"></div>
<h3>ท่าต่อสู้</h3><div>สะกดจิต <img src="https://asia.pokemon-card.com/various_images/energy/Colorless.png"></div>
<table><tr><td><img src="https://asia.pokemon-card.com/various_images/energy/Fire.png"> ×2</td></tr></table>
<div><img src="https://asia.pokemon-card.com/th/card-img/mark/th_ma6t_exp.png"> J 001/130</div>
<h3>No.102 โปเกมอนไข่</h3><p>เพราะมันส่งโทรจิตที่สื่อถึงกันได้เฉพาะในพวกทามะทามะ</p>
<a href="/th/card-search/list/?illustratorName=Nelnal">Nelnal</a>
<a href="/th/card-search/list/?expansionCodes=MA6">การ์ดชุดเสริม "30th CELEBRATION"</a></body></html>`;
exports.LL_ARCH = `<html><body><h1>Dragapult</h1>
<a href="/decks/list/29678">list</a><a href="/decks/list/31083">list</a><a href="/decks/list/29678">dup</a><a href="/players/1">p</a></body></html>`;
const c = (set, n, name, q, xs) => `<a href="https://limitlesstcg.com/cards/${set}/${n}">${q} ${name} <img src="x/${set}.png" alt="${set}"></a>`;
exports.LL_LIST = `<html><head><title>Dragapult by Demi Eaton – Limitless</title>
<meta property="og:description" content="Dragapult decklist by Demi Eaton - 104th Place Regional Frankfurt - 26th September 2026">
<meta property="og:image" content="https://s3.limitlesstcg.com/decklists/29678.png"></head><body>
<img src="https://limitless3.nyc3.cdn.digitaloceanspaces.com/formats/standard.png">
<div>Pokémon (3)</div>${c('TWM', '128', 'Dreepy TWM', 4)}${c('TWM', '130', "Dragapult ex TWM", 3)}${c('ASC', '16', 'Budew ASC', 2)}
<div>Trainer (2)</div>${c('MEG', '119', "Lillie's Determination", 4)}${c('MEG', '114', "Boss's Orders", 3)}
<div>Energy (1)</div>${c('MEE', '10', 'Fire Energy', 3)}
<a href="https://limitlesstcg.com/cards/TWM/128"><img src="https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/TWM/TWM_128_R_EN_XS.png" alt="Dreepy"></a>
</body></html>`;
exports.PCB = `<html><head><meta property="og:title" content="【デッキレシピ】ドラパルトex | ポケカブック">
<meta property="og:image" content="https://pokecabook.com/wp-content/uploads/x.jpg"><meta property="article:published_time" content="2026-10-01T09:00:00+09:00"></head>
<body><article><p>デッキコード: abc123-defG45-hij678</p><img src="https://www.pokemon-card.com/assets/images/card_images/large/SV6/0001.jpg" alt="ドラメシヤ"></article></body></html>`;
