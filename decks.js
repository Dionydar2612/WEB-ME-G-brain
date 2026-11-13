// หน้า "เด็คสาธารณะ" (แกลเลอรี) + ตัวสร้างเด็ค + หน้า "การ์ด" — โหลดก่อนสคริปต์หลักใน index.html
// ใช้ตัวช่วยจาก index.html (sb, $, app, esc, safeUrl, user, need, isAdmin, modal, fixImgs) ตอนเรียกใช้งานเท่านั้น
const DECK_MAX=60,SECS=[['pokemon','Pokémon'],['trainer','Trainer'],['energy','Energy']];
const SRC_LABEL={community:'ชุมชน',limitless:'Limitless',pokecabook:'Pokecabook'};
const SORTS=[['new','ล่าสุด'],['likes','ยอดไลค์'],['day','ยอดดูวันนี้'],['week','ยอดดูสัปดาห์'],['month','ยอดดูเดือน'],['all','ยอดดูมากสุด']];
const GAL_COLS='id,name,author_name,tags,format,source,source_name,likes,views,created_at,user_id,placement,event,player';
const DECK_PER=24;
let dq={q:'',sort:'new',src:'',fmt:'',open:false,shown:DECK_PER};
const imgOk=u=>''; // Deliberately do not render external artwork.
const num=n=>Number(n||0).toLocaleString('th-TH');
const cleanTag=t=>String(t).toLowerCase().replace(/^#+/,'').replace(/\s+/g,'-').replace(/[^a-z0-9ก-๙_-]/g,'').slice(0,30);
const secOf=s=>s=='pokemon'||s=='trainer'||s=='energy'?s:'pokemon';
const cardsToText=c=>SECS.map(([k,l])=>{const L=c.filter(x=>x.sec==k);return L.length?`${l}: ${L.reduce((a,x)=>a+x.q,0)}\n`+L.map(x=>`${x.q} ${x.n}${x.set?' '+x.set+(x.num?' '+x.num:''):''}`).join('\n'):''}).filter(Boolean).join('\n\n');
const deckTotal=c=>(c||[]).reduce((a,x)=>a+(x.q||0),0);
const toast=async t=>{try{await navigator.clipboard.writeText(t);return true}catch{const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();let ok=false;try{ok=document.execCommand('copy')}catch{}a.remove();return ok}};

// ---------- ชิ้นส่วน UI ----------
const deckTile=(d,liked)=>`<a class="dt" href="#/decks/${d.id}"><span class="by">👤 ${esc(d.author_name||d.player||'ผู้เล่น')}</span><span class="st"><span>👍 ${num(d.likes)}</span><span>👁 ${num(d.views)}</span></span><span class="cv ph gbrain-ph"><span>G</span><small>DECK</small></span>${d.source&&d.source!='community'?`<span class="src ${esc(d.source)}">${esc(SRC_LABEL[d.source]||d.source)}</span>`:''}<span class="cap">${esc(d.name)}</span></a>`;
const cardFace=c=>`<div class="nm card-text-face"><span>${esc(c.n||c.name||'การ์ด')}</span><small>${esc(c.set||c.expansion||'')}</small></div>`;
const cardTile=(c,{qty,btn}={})=>`<div class="ct text-card" ${btn?`data-add="${esc(btn)}"`:''} title="${esc(c.n||c.name)}">${cardFace(c)}${qty?`<span class="q">×${qty}</span>`:''}</div>`;
function zoom(c){modal(`<div class="zoom"><b>${esc(c.n||c.name)}</b><div class="mut">${c.set?esc(c.set)+' '+esc(c.num||''):''}</div><p class="mut">แสดงข้อมูลแบบข้อความ โดยไม่เผยแพร่ภาพการ์ดที่ยังไม่มีหลักฐานอนุญาต</p></div><div class="row end"><button class="soft" onclick="this.closest('.ov').remove()">ปิด</button></div>`)}

// ---------- แกลเลอรี ----------
async function decks(id){
  if(id=='new'||(id||'').startsWith('edit-'))return deckEditor(id=='new'?null:id.slice(5));
  if(id)return deckDetail(id);
  app.innerHTML='<p class="mut">กำลังโหลด…</p>';
  const since=h=>new Date(Date.now()-h*3600e3).toISOString();
  const[{data:rows,error},likesR]=await Promise.all([sb.from('decklists').select(GAL_COLS).eq('is_public',true).order('created_at',{ascending:false}).limit(300),
    user?sb.from('deck_likes').select('deck_id').eq('user_id',user.id):Promise.resolve({data:[]})]);
  if(error){app.innerHTML=`<div class="card bad">โหลดเด็คไม่สำเร็จ: ${esc(error.message)}<br><span class="mut">ตรวจว่ารัน decks.sql ใน Supabase แล้ว</span></div>`;return}
  let all=rows||[],vc={};
  const per={day:24,week:168,month:720}[dq.sort];
  if(per){const{data}=await sb.rpc('deck_view_counts',{p_since:since(per)});(data||[]).forEach(r=>vc[r.deck_id]=Number(r.n))}
  const hot=[...all].sort((a,b)=>(b.likes*5+b.views)-(a.likes*5+a.views)).slice(0,8);
  const q=dq.q.trim().toLowerCase();
  let L=all.filter(d=>(!dq.src||d.source==dq.src)&&(!dq.fmt||d.format==dq.fmt)&&(!q||(q[0]=='#'?(d.tags||[]).some(t=>t.startsWith(cleanTag(q))):[d.name,d.author_name,d.player,d.event,...(d.tags||[])].some(x=>String(x||'').toLowerCase().includes(q)))));
  const key={new:d=>0,likes:d=>d.likes,all:d=>d.views,day:d=>vc[d.id]||0,week:d=>vc[d.id]||0,month:d=>vc[d.id]||0}[dq.sort];
  if(dq.sort!='new')L.sort((a,b)=>key(b)-key(a)||new Date(b.created_at)-new Date(a.created_at));
  const fmts=[...new Set(all.map(d=>d.format).filter(Boolean))];
  app.innerHTML=`<div class="dh"><div><h2>เด็คสาธารณะ</h2><div class="mut">สำรวจและค้นหาแรงบันดาลใจจากเด็คของผู้เล่นคนอื่น</div></div><button class="cta" id="dnew">สร้างเด็คของคุณ</button></div>
  ${hot.length?`<div class="dsec">เด็คยอดฮิต</div><div class="hot"><div class="hotrow" id="hot">${hot.map(d=>deckTile(d)).join('')}</div><button class="hotnext" id="hn" aria-label="ถัดไป">›</button></div>`:''}
  <div class="dbar"><div class="dsearch"><input id="dqi" placeholder="ค้นหาเด็ค… (ใช้ # สำหรับค้นหาแท็ก)" value="${esc(dq.q)}"></div>
    <button class="fbtn" id="dfb">⚲ ตัวกรอง${dq.src||dq.fmt?' •':''}</button>
    <div class="sortbar"><span class="mut">เรียงตาม:</span>${SORTS.map(([k,l])=>`<button class="sp ${dq.sort==k?'on':''}" data-s="${k}">${l}</button>`).join('')}</div></div>
  ${dq.open?`<div class="fpanel"><label>แหล่งที่มา<select id="dfs"><option value="">ทั้งหมด</option>${Object.entries(SRC_LABEL).map(([k,v])=>`<option value="${k}" ${dq.src==k?'selected':''}>${v}</option>`).join('')}</select></label>
    <label>Format<select id="dff"><option value="">ทั้งหมด</option>${fmts.map(f=>`<option ${dq.fmt==f?'selected':''}>${esc(f)}</option>`).join('')}</select></label></div>`:''}
  <div class="dgrid">${L.slice(0,dq.shown).map(d=>deckTile(d)).join('')||'<p class="mut">ไม่พบเด็คที่ตรงกับเงื่อนไข</p>'}</div>
  ${L.length>dq.shown?`<button class="ghost dmore" id="dmore">โหลดเพิ่ม (${L.length-dq.shown})</button>`:''}
  <p class="mut disc">เด็คชุมชนและรายการเด็คที่มีแหล่งอ้างอิงแสดงเป็นข้อความเท่านั้น โปรดตรวจสอบสิทธิ์และเงื่อนไขของข้อมูลจากต้นทาง</p>`;
  fixImgs(app);
  $('#dnew').onclick=()=>{location.hash='#/decks/new'};
  $('#dfb').onclick=()=>{dq.open=!dq.open;decks()};
  let t;$('#dqi').oninput=e=>{clearTimeout(t);t=setTimeout(()=>{dq.q=e.target.value;dq.shown=DECK_PER;const p=e.target.selectionStart;decks().then(()=>{const i=$('#dqi');if(i){i.focus();i.setSelectionRange(p,p)}})},350)};
  app.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{dq.sort=b.dataset.s;dq.shown=DECK_PER;decks()});
  if($('#dfs'))$('#dfs').onchange=e=>{dq.src=e.target.value;dq.shown=DECK_PER;decks()};if($('#dff'))$('#dff').onchange=e=>{dq.fmt=e.target.value;dq.shown=DECK_PER;decks()};
  if($('#dmore'))$('#dmore').onclick=()=>{dq.shown+=DECK_PER;decks()};
  if($('#hn'))$('#hn').onclick=()=>$('#hot').scrollBy({left:400,behavior:'smooth'});
}

// ---------- รายละเอียดเด็ค ----------
async function deckDetail(id){
  const{data:d,error}=await sb.from('decklists').select('*').eq('id',id).maybeSingle();
  if(error||!d){app.innerHTML='<a href="#/decks">← กลับ</a><div class="card">ไม่พบเด็คนี้ (หรือเป็นเด็คส่วนตัว)</div>';return}
  try{if(!sessionStorage.getItem('dv'+id)){sessionStorage.setItem('dv'+id,'1');sb.rpc('track_deck_view',{p_deck:id}).then(()=>{})}}catch{}
  const[{data:lk}]=await Promise.all([user?sb.from('deck_likes').select('deck_id').eq('deck_id',id).eq('user_id',user.id):Promise.resolve({data:[]})]);
  let liked=!!(lk&&lk.length),likes=d.likes;const mine=user&&d.user_id==user.id,canEdit=mine||isAdmin();
  const cards=Array.isArray(d.cards)?d.cards:[],tot=deckTotal(cards);
  const draw=()=>{app.innerHTML=`<a href="#/decks">← เด็คสาธารณะ</a>
  <div class="dhero"><div class="cv ph gbrain-ph" style="width:100%;height:180px"><span>G</span><small>G-BRAIN DECK</small></div>
  <div><h2 style="margin:0">${esc(d.name)}</h2>
   <div class="mut">โดย ${esc(d.author_name||d.player||'ผู้เล่น')}${d.placement?` · ${esc(d.placement)}`:''}${d.event?` · ${esc(d.event)}`:''}${d.event_date?` · ${esc(fmtDate(new Date(d.event_date)))}`:''}</div>
   <div style="margin:8px 0">${(d.tags||[]).map(t=>`<a class="tag" data-t="${esc(t)}">#${esc(t)}</a>`).join('')}</div>
   ${d.description?`<p style="white-space:pre-wrap">${esc(d.description)}</p>`:''}
   <div class="mut">👍 ${num(likes)} · 👁 ${num(d.views)}${tot?` · ${tot} ใบ`:''}${d.format?` · ${esc(d.format)}`:''} ${d.is_public?'':'· 🔒 ส่วนตัว'}</div>
   <div class="dact"><button id="lk" class="${liked?'liked':'ghost'}">👍 ${liked?'ถูกใจแล้ว':'ถูกใจ'}</button><button class="ghost" id="cp">📋 คัดลอกลิสต์</button><button class="ghost" id="cl">⧉ ทำสำเนาเป็นของฉัน</button>
    ${canEdit?`<a class="btn" href="#/decks/edit-${d.id}" style="background:var(--card);color:var(--tx);border:1px solid var(--bd)">✏️ แก้ไข</a><button class="ghost" id="dx">🗑️ ลบ</button>`:''}</div>
   ${d.source_url&&/^https?:\/\//.test(d.source_url)?`<div class="nsrc">แหล่งที่มา: <a href="${esc(d.source_url)}" target="_blank" rel="noopener noreferrer">${esc(d.source_name||'ต้นทาง')} ↗</a></div>`:''}
   ${d.deck_code?`<div class="nsrc">รหัสเด็ค: <b>${esc(d.deck_code)}</b> · <a href="https://www.pokemon-card.com/deck/confirm.html/deckID/${encodeURIComponent(d.deck_code)}/" target="_blank" rel="noopener noreferrer">เปิดบนเว็บทางการ ↗</a></div>`:''}</div></div>
  ${cards.length?SECS.map(([k,l])=>{const L=cards.filter(c=>secOf(c.sec)==k);return L.length?`<div class="secs">${l} <span class="mut">(${deckTotal(L)})</span></div><div class="cg">${L.map((c,i)=>cardTile(c,{qty:c.q,btn:k+':'+i})).join('')}</div>`:''}).join(''):`<div class="card"><pre>${esc(d.list||'')}</pre></div>`}`;
  fixImgs(app);
  app.querySelectorAll('[data-t]').forEach(a=>a.onclick=()=>{dq.q='#'+a.dataset.t;dq.shown=DECK_PER;location.hash='#/decks'});
  app.querySelectorAll('[data-add]').forEach(el=>el.onclick=()=>{const[k,i]=el.dataset.add.split(':');zoom(cards.filter(c=>secOf(c.sec)==k)[+i])});
  $('#cp').onclick=async e=>{const ok=await toast(d.list||cardsToText(cards));e.target.textContent=ok?'✓ คัดลอกแล้ว':'คัดลอกไม่ได้'};
  $('#lk').onclick=async()=>{if(need())return;liked=!liked;likes+=liked?1:-1;draw();
    const{error}=await(liked?sb.from('deck_likes').insert({deck_id:id}):sb.from('deck_likes').delete().eq('deck_id',id).eq('user_id',user.id));if(error){liked=!liked;likes+=liked?1:-1;draw();alert(error.message)}};
  $('#cl').onclick=async()=>{if(need())return;const cleanCards=cards.map(({img,image_url,...c})=>c);const{data:n,error}=await sb.from('decklists').insert({name:d.name+' (สำเนา)',list:d.list||cardsToText(cards),cards:cleanCards,cover_url:null,tags:d.tags||[],format:d.format,is_public:false,author_name:d.author_name}).select('id').single();
    if(error)return alert(error.message);location.hash='#/decks/edit-'+n.id};
  if($('#dx'))$('#dx').onclick=async()=>{if(!confirm(`ลบเด็ค "${d.name}"?`))return;const{error}=await sb.from('decklists').delete().eq('id',id);if(error)return alert(error.message);location.hash='#/decks'};
  };draw();
}

// ---------- ตัวสร้างเด็ค ----------
function parseDeckText(raw){ // PTCG Live: "4 Dreepy TWM 128" + หัวข้อ "Pokémon: 12"
  let sec='pokemon';const out=[];
  for(const ln of String(raw).split(/\r?\n/)){const t=ln.trim();if(!t)continue;
    const h=t.match(/^(pok[eé]mon|trainer|energy)\s*[:：(]/i);if(h){sec=h[1].toLowerCase().startsWith('pok')?'pokemon':h[1].toLowerCase();continue}
    const m=t.match(/^(\d{1,2})\s+(.+?)(?:\s+([A-Z0-9]{2,5})\s+(\d+[A-Za-z]*))?$/);if(!m)continue;
    out.push({q:Math.min(+m[1],60),n:m[2].slice(0,80),sec,set:m[3]||null,num:m[4]||null})}
  return out}
async function deckEditor(editId){
  if(need())return;
  let row=null;
  if(editId){const{data}=await sb.from('decklists').select('*').eq('id',editId).maybeSingle();row=data;
    if(!row||!(row.user_id==user.id||isAdmin())){app.innerHTML='<a href="#/decks">← กลับ</a><div class="card bad">ไม่พบเด็ค หรือไม่มีสิทธิ์แก้ไข</div>';return}}
  const D=(row?.cards||[]).map(c=>({...c,sec:secOf(c.sec)}));
  const meta={name:row?.name||'',description:row?.description||'',tags:(row?.tags||[]).join(', '),is_public:row?row.is_public:true,author:row?.author_name||(user.email||'').split('@')[0]};
  let res=[],cq='',ct='';
  app.innerHTML=`<a href="#/decks">← เด็คสาธารณะ</a><h2>${editId?'แก้ไขเด็ค':'สร้างเด็คของคุณ'}</h2>
  <div class="bld"><div>
    <div class="card"><b>ค้นหาการ์ด</b><div class="row"><input id="cs" placeholder="ชื่อการ์ด (ไทย)…" style="flex:1;min-width:160px"><select id="ctp"><option value="">ทุกประเภท</option><option value="pokemon">Pokémon</option><option value="trainer">Trainer</option><option value="energy">Energy</option></select></div>
    <div class="cres cg" id="cr"><span class="mut">พิมพ์ชื่อเพื่อค้นหา — กดที่การ์ดเพื่อเพิ่มเข้าเด็ค (กดซ้ำเพื่อเพิ่มจำนวน)</span></div></div>
    <div class="card"><b>นำเข้าจากข้อความ</b><div class="mut">วางลิสต์รูปแบบ PTCG Live (เช่น <code>4 Dreepy TWM 128</code>) — ระบบจะแสดงรายการเป็นข้อความ</div><textarea id="imp" placeholder="Pokémon: 12&#10;4 Dreepy TWM 128&#10;…"></textarea><button class="ghost" id="impb">นำเข้า</button></div></div>
  <div class="side card"><div class="lh"><span class="cnt" id="cnt"></span><span class="mut">/ ${DECK_MAX}</span></div>
    <label>ชื่อเด็ค<input id="dn" value="${esc(meta.name)}" maxlength="120"></label><label>ชื่อผู้สร้างที่แสดง<input id="da" value="${esc(meta.author)}" maxlength="40"></label>
    <label>แท็ก (คั่นด้วย ,)<input id="dtg" value="${esc(meta.tags)}" placeholder="เช่น dragapult, standard"></label><label>คำอธิบาย<textarea id="dd" style="min-height:70px">${esc(meta.description)}</textarea></label>
    <label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="dp" ${meta.is_public?'checked':''} style="width:auto"> สาธารณะ (แสดงในแกลเลอรี)</label>
    <div id="dl"></div><div class="row end" style="margin-top:10px"><button class="soft" id="dcx">ยกเลิก</button><button id="dsv">บันทึกเด็ค</button></div><div id="dmsg" class="mut"></div></div></div>`;
  const drawList=()=>{const n=deckTotal(D),c=$('#cnt');c.textContent=n;c.className='cnt '+(n==DECK_MAX?'full':n>DECK_MAX?'over':'');
    $('#dl').innerHTML=SECS.map(([k,l])=>{const L=D.map((c,i)=>({c,i})).filter(x=>x.c.sec==k);return L.length?`<div class="secs">${l} <span class="mut">(${deckTotal(L.map(x=>x.c))})</span></div>`+L.map(({c,i})=>`<div class="dl"><span class="n" title="${esc(c.n)}">${esc(c.n)}</span><button class="ghost" data-m="${i}">−</button><b>${c.q}</b><button class="ghost" data-p="${i}">＋</button></div>`).join(''):''}).join('')||'<p class="mut">ยังไม่มีการ์ด</p>';
    $('#dl').querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{const c=D[+b.dataset.m];if(--c.q<=0)D.splice(+b.dataset.m,1);drawList()});
    $('#dl').querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{D[+b.dataset.p].q++;drawList()})};
  const add=c=>{const f=D.find(x=>x.id==c.id&&x.n==c.n);if(f)f.q++;else D.push(c);drawList()};
  const drawRes=()=>{$('#cr').innerHTML=res.map((c,i)=>cardTile({n:c.name,set:c.expansion},{btn:String(i)})).join('')||'<span class="mut">ไม่พบการ์ด</span>';
    $('#cr').querySelectorAll('[data-add]').forEach(el=>el.onclick=()=>{const c=res[+el.dataset.add];add({q:1,n:c.name,sec:secOf(c.supertype),id:c.id,set:c.expansion||null,num:c.number||null})})};
  let t;const search=async()=>{cq=$('#cs').value.trim();ct=$('#ctp').value;if(!cq&&!ct){return}
    let q=sb.from('cards').select('id,name,supertype,expansion,number').order('source_id').limit(60);if(cq)q=q.ilike('name','%'+cq.replace(/[%_,()]/g,' ')+'%');if(ct)q=q.eq('supertype',ct);
    const{data,error}=await q;if(error){$('#cr').innerHTML=`<span class="bad">${esc(error.message)}</span>`;return}res=data||[];drawRes()};
  $('#cs').oninput=()=>{clearTimeout(t);t=setTimeout(search,300)};$('#ctp').onchange=search;
  $('#impb').onclick=async()=>{const items=parseDeckText($('#imp').value);if(!items.length)return;
    const names=[...new Set(items.map(i=>i.n))];const{data}=await sb.from('cards').select('id,name,supertype').in('name',names).limit(500);
    const by=new Map();(data||[]).forEach(c=>{if(!by.has(c.name))by.set(c.name,c)});
    items.forEach(i=>{const c=by.get(i.n);const f=D.find(x=>x.n==i.n&&(x.set||'')==(i.set||'')&&(x.num||'')==(i.num||''));if(f)f.q+=i.q;else D.push({...i,id:c?.id,sec:c?secOf(c.supertype):i.sec})});
    $('#imp').value='';drawList();const miss=items.filter(i=>!by.has(i.n)).length;$('#dmsg').textContent=`นำเข้า ${items.length} รายการ${miss?` (ไม่พบข้อมูลในฐานข้อมูล ${miss} รายการ — เก็บชื่อจากรายการนำเข้า)`:''}`};
  $('#dcx').onclick=()=>{location.hash=editId?'#/decks/'+editId:'#/decks'};
  $('#dsv').onclick=async()=>{const name=$('#dn').value.trim();if(!name){$('#dmsg').textContent='ใส่ชื่อเด็คก่อน';return}if(!D.length){$('#dmsg').textContent='เพิ่มการ์ดอย่างน้อย 1 ใบ';return}
    const cover=null;
    const payload={name,list:cardsToText(D),cards:D.map(c=>({q:c.q,n:c.n,sec:c.sec,set:c.set||null,num:c.num||null,id:c.id||null})),cover_url:cover,
      tags:[...new Set($('#dtg').value.split(',').map(cleanTag).filter(Boolean))].slice(0,8),description:$('#dd').value.trim()||null,is_public:$('#dp').checked,author_name:$('#da').value.trim().slice(0,40)||null};
    $('#dsv').disabled=true;const{data,error}=await(editId?sb.from('decklists').update(payload).eq('id',editId).select('id').single():sb.from('decklists').insert(payload).select('id').single());
    if(error){$('#dsv').disabled=false;$('#dmsg').textContent=error.message;return}location.hash='#/decks/'+data.id};
  drawList();
}

// ---------- หน้าการ์ด ----------
let cgq={q:'',type:'',en:'',page:0};const CPER=48;
const ENERGY_TH={grass:'หญ้า',fire:'ไฟ',water:'น้ำ',lightning:'สายฟ้า',psychic:'พลังจิต',fighting:'ต่อสู้',darkness:'ความมืด',metal:'โลหะ',fairy:'แฟรี่',dragon:'มังกร',colorless:'ไร้สี'};
const ENERGY_IMG={grass:'Grass',fire:'Fire',water:'Water',lightning:'Lightning',psychic:'Psychic',fighting:'Fighting',darkness:'Darkness',metal:'Metal',fairy:'Fairy',dragon:'Dragon',colorless:'Colorless'};
async function cardsPg(){
  let q=sb.from('cards').select('id,name,supertype,energy_type,hp,stage,expansion,expansion_name,number,source_url',{count:'exact'}).order('source_id',{ascending:false}).range(cgq.page*CPER,cgq.page*CPER+CPER-1);
  if(cgq.q)q=q.ilike('name','%'+cgq.q.replace(/[%_,()]/g,' ')+'%');if(cgq.type)q=q.eq('supertype',cgq.type);if(cgq.en)q=q.eq('energy_type',cgq.en);
  const{data,count,error}=await q,L=data||[];
  app.innerHTML=`<div class="dh"><div><h2>การ์ด</h2><div class="mut">ฐานข้อมูลข้อมูลการ์ดสำหรับชุมชน — ${count==null?'':num(count)+' รายการ'}</div></div><a class="btn" href="#/decks/new">＋ สร้างเด็ค</a></div>
  <div class="dbar"><div class="dsearch"><input id="cq" placeholder="ค้นหาชื่อโปเกมอน / การ์ด…" value="${esc(cgq.q)}"></div>
   <select id="cty"><option value="">ทุกประเภท</option>${SECS.map(([k,l])=>`<option value="${k}" ${cgq.type==k?'selected':''}>${l}</option>`).join('')}</select>
   <select id="cen"><option value="">ทุกธาตุ</option>${Object.entries(ENERGY_TH).map(([k,v])=>`<option value="${k}" ${cgq.en==k?'selected':''}>${v}</option>`).join('')}</select></div>
  ${error?`<div class="card bad">${esc(error.message)}<br><span class="mut">ตรวจว่ารัน decks.sql แล้ว</span></div>`:''}
  ${!error&&!L.length?'<div class="card mut">ยังไม่มีข้อมูลการ์ด — เพิ่มข้อมูลที่ได้รับอนุญาตหรือข้อมูลที่ทีมงานป้อนเอง</div>':''}
  <div class="cg" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px">${L.map((c,i)=>`<div class="ct" data-i="${i}" title="${esc(c.name)}">${cardFace(c)}<div class="nm2">${esc(c.name)}</div></div>`).join('')}</div>
  <div class="npg"><button class="ghost" id="cpv" ${cgq.page?'':'disabled'}>‹ ก่อนหน้า</button><span class="mut">หน้า ${cgq.page+1}${count?` / ${Math.max(1,Math.ceil(count/CPER))}`:''}</span><button class="ghost" id="cnx" ${count!=null&&(cgq.page+1)*CPER>=count?'disabled':''}>ถัดไป ›</button></div>
  <p class="mut disc">ข้อมูลบางรายการอาจอ้างอิงชื่อและข้อเท็จจริงจากแหล่งต้นทาง โปรดตรวจสอบสิทธิ์และเงื่อนไขก่อนนำเข้า</p>`;
  fixImgs(app);let t;
  $('#cq').oninput=e=>{clearTimeout(t);t=setTimeout(()=>{cgq.q=e.target.value;cgq.page=0;const p=e.target.selectionStart;cardsPg().then(()=>{const i=$('#cq');i.focus();i.setSelectionRange(p,p)})},350)};
  $('#cty').onchange=e=>{cgq.type=e.target.value;cgq.page=0;cardsPg()};$('#cen').onchange=e=>{cgq.en=e.target.value;cgq.page=0;cardsPg()};
  $('#cpv').onclick=()=>{cgq.page--;cardsPg()};$('#cnx').onclick=()=>{cgq.page++;cardsPg()};
  app.querySelectorAll('[data-i]').forEach(el=>el.onclick=()=>cardModal(L[+el.dataset.i]));
}
function cardModal(c){
  const en=c.energy_type&&ENERGY_TH[c.energy_type];
  modal(`<div class="zoom"><b style="font-size:18px">${esc(c.name)}</b></div>
  <div class="sum">${c.stage?`<span class="chip">${esc(c.stage)}</span> `:''}${c.supertype?`<span class="chip">${esc(c.supertype)}</span> `:''}${c.hp?`HP <b>${c.hp}</b> `:''}${en?`<span class="chip">${esc(en)}</span>`:''}</div>
  <div class="mut">${c.expansion_name?esc(c.expansion_name)+' · ':''}${c.number?esc(c.number):''}</div>
  <p class="mut">แสดงเฉพาะข้อมูลเชิงข้อความ ไม่มีภาพ Artwork หรือข้อความบรรยายที่คัดลอกจากหน้าการ์ด</p>
  <div class="row end">${/^https:\/\/asia\.pokemon-card\.com\//.test(c.source_url||'')?`<a href="${esc(c.source_url)}" target="_blank" rel="noopener noreferrer" class="mut" style="align-self:center">ตรวจสอบข้อมูลต้นทาง ↗</a>`:''}<button class="soft" onclick="this.closest('.ov').remove()">ปิด</button></div>`)}

