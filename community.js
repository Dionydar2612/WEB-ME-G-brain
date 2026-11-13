// คอมมูนิตี้: ฟีดโพสต์ · ห้องแชทเรียลไทม์ · โปรไฟล์ · ส่วนแอดมิน — โหลดก่อนสคริปต์หลักใน index.html
// ใช้ตัวช่วยจาก index.html (sb, $, app, esc, user, myProf, isAdmin, modal, admin) ตอนเรียกใช้งานเท่านั้น
const BUCKET='community',FEED_PER=15,CHAT_PER=50,CHAT_MAX=300;

// ---------- ตัวช่วย ----------
const PROF=new Map(); // user_id -> โปรไฟล์สาธารณะ (ไม่มีอีเมล)
async function loadProfiles(ids){
  const miss=[...new Set(ids.filter(Boolean))].filter(i=>!PROF.has(i));
  if(!miss.length)return;
  const{data}=await sb.from('member_profiles').select('id,name,avatar_url,role,bio,banned,created_at').in('id',miss);
  (data||[]).forEach(p=>PROF.set(p.id,p));
}
const prof=id=>PROF.get(id)||{id,name:'สมาชิก',avatar_url:null,role:'user'};
const meName=()=>myProf?.display_name||('สมาชิก-'+String(user?.id||'').slice(0,4));
const hue=id=>{let h=0;for(const c of String(id))h=(h*31+c.charCodeAt(0))%360;return `hsl(${h} 55% 45%)`};
// รับเฉพาะรูปที่อยู่ใน bucket ของเราเอง (กันลิงก์รูปแปลกปลอมที่ถูกยัดผ่าน API)
const okImg=u=>typeof u=='string'&&u.startsWith(SUPABASE_URL+'/storage/v1/object/public/'+BUCKET+'/')?u:'';
const avatar=(p,sz='')=>{const u=okImg(p.avatar_url);
  return u?`<img class="av ${sz}" src="${esc(u)}" alt="" loading="lazy">`
    :`<span class="av ${sz}" style="background:${hue(p.id)}">${esc([...String(p.name||'?')][0]||'?')}</span>`};
const ago=s=>{const d=(Date.now()-new Date(s))/1000;
  if(d<60)return 'เมื่อสักครู่';if(d<3600)return Math.floor(d/60)+' นาทีที่แล้ว';
  if(d<86400)return Math.floor(d/3600)+' ชม.ที่แล้ว';if(d<604800)return Math.floor(d/86400)+' วันที่แล้ว';
  return new Date(s).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'})};
const clock=s=>new Date(s).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
const dayLabel=s=>{const d=new Date(s),t=new Date();
  return d.toDateString()==t.toDateString()?clock(s):d.toLocaleDateString('th-TH',{day:'numeric',month:'short'})+' '+clock(s)};
const rich=t=>esc(t).replace(/(https?:\/\/[^\s<]+)/g,u=>`<a href="${u}" target="_blank" rel="noopener noreferrer nofollow">${u}</a>`);
const canPost=()=>!!user&&!myProf?.banned;
const askLogin=()=>{alert('กรุณา Log In ก่อน');location.hash='#/login'};
function zoomImg(src){const o=document.createElement('div');o.className='ov';
  o.innerHTML=`<img class="zoomimg" src="${esc(src)}" alt="">`;o.onclick=()=>o.remove();document.body.appendChild(o)}

// ---------- รูปภาพ: ย่อในเบราว์เซอร์ก่อนอัปโหลด + ตั้งแคชยาว 1 ปี ----------
async function shrink(file,max=1280,q=.82){
  if(!file.type.startsWith('image/'))throw new Error('ไฟล์นี้ไม่ใช่รูปภาพ');
  let bmp;
  try{bmp=await createImageBitmap(file)}
  catch{bmp=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>no(new Error('เปิดรูปนี้ไม่ได้'));i.src=URL.createObjectURL(file)})}
  const w0=bmp.width||bmp.naturalWidth,h0=bmp.height||bmp.naturalHeight,k=Math.min(1,max/Math.max(w0,h0));
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w0*k));c.height=Math.max(1,Math.round(h0*k));
  c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
  const to=(t,qq)=>new Promise(r=>c.toBlob(r,t,qq));
  let b=await to('image/webp',q);
  if(!b||b.type!='image/webp')b=await to('image/jpeg',q); // Safari เก่าไม่รองรับ webp
  for(let qq=q;b&&b.size>950*1024&&qq>.4;){qq-=.12;b=await to(b.type,qq)}
  if(!b||b.size>1024*1024)throw new Error('รูปใหญ่เกินไป ลองรูปอื่น');
  return b;
}
async function uploadImg(file,max){
  const b=await shrink(file,max),ext=b.type=='image/webp'?'webp':'jpg';
  const path=`${user.id}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  const{error}=await sb.storage.from(BUCKET).upload(path,b,{cacheControl:'31536000',contentType:b.type,upsert:false});
  if(error)throw error;
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
function removeImg(url){ // ลบไฟล์ในที่เก็บ (best-effort) เมื่อลบโพสต์/ข้อความ/เปลี่ยนรูปโปรไฟล์
  const pre=SUPABASE_URL+'/storage/v1/object/public/'+BUCKET+'/';
  if(url&&url.startsWith(pre))sb.storage.from(BUCKET).remove([decodeURIComponent(url.slice(pre.length))]).then(()=>{},()=>{});
}
// ปุ่มเลือกรูป + พรีวิว: คืนตัวควบคุมให้ผู้เรียกอ่านไฟล์/ล้างค่า
function imgPick(btn,input,prevBox){
  let file=null;
  const set=f=>{file=f;prevBox.innerHTML=f?`<div class="prev"><img src="${URL.createObjectURL(f)}" alt=""><button class="ic" type="button" data-px>✕</button></div>`:'';
    if(f)prevBox.querySelector('[data-px]').onclick=()=>{set(null);input.value=''}};
  btn.onclick=()=>input.click();input.onchange=()=>set(input.files[0]||null);
  return{get:()=>file,clear:()=>{set(null);input.value=''}};
}

// ================= ฟีดโพสต์ =================
const postHtml=(p,s,liked)=>{
  const a=prof(p.user_id),img=okImg(p.image_url),can=user&&(p.user_id==user.id||isAdmin());
  return `<article class="card post" data-id="${p.id}" data-pin="${p.pinned?1:0}" data-img="${esc(p.image_url||'')}">
  <div class="phd">${avatar(a)}<div class="pmeta"><a href="#/u/${p.user_id}" class="pname">${esc(a.name)}</a>${a.role=='admin'?'<span class="badge a">Admin</span>':''}${p.pinned?'<span class="chip pin">📌 ปักหมุด</span>':''}
    <div class="mut" title="${esc(new Date(p.created_at).toLocaleString('th-TH'))}">${ago(p.created_at)}</div></div>
    <div class="pact">${isAdmin()?`<button class="ic" data-act="pin" title="${p.pinned?'เลิกปักหมุด':'ปักหมุด'}">${p.pinned?'📍':'📌'}</button>`:''}${can?'<button class="ic" data-act="del" title="ลบโพสต์">🗑️</button>':''}</div></div>
  ${p.body?`<div class="pbody">${rich(p.body)}</div>`:''}
  ${img?`<img class="pimg" src="${esc(img)}" loading="lazy" alt="" data-act="zoom">`:''}
  <div class="pbar"><button class="ghost lk ${liked?'on':''}" data-act="like">${liked?'❤️':'🤍'} <span>${s.likes}</span></button><button class="ghost" data-act="cmt">💬 <span>${s.comments}</span></button></div>
  <div class="cbox" hidden></div></article>`};
const commentHtml=c=>{const a=prof(c.user_id),can=user&&(c.user_id==user.id||isAdmin());
  return `<div class="cm" data-cid="${c.id}">${avatar(a,'sm')}<div class="cb"><a href="#/u/${c.user_id}" class="pname">${esc(a.name)}</a> <span class="mut">${ago(c.created_at)}</span>${can?' <button class="ic" data-act="cdel" title="ลบ">🗑️</button>':''}<div>${rich(c.body)}</div></div></div>`};

async function loadComments(box,pid){
  box.innerHTML='<div class="mut">กำลังโหลด…</div>';
  const{data,error}=await sb.from('comments').select('id,user_id,body,created_at').eq('post_id',pid).order('created_at');
  if(error){box.innerHTML=`<div class="bad">โหลดคอมเมนต์ไม่สำเร็จ: ${esc(error.message)}</div>`;return}
  await loadProfiles((data||[]).map(c=>c.user_id));
  box.innerHTML=`<div class="clist">${(data||[]).map(commentHtml).join('')}</div>`+
    (canPost()?`<div class="cform"><input class="cin" maxlength="1000" placeholder="เขียนคอมเมนต์…"><button data-act="csend">ส่ง</button></div>`
      :`<div class="mut">${user?'บัญชีของคุณถูกระงับ':'<a href="#/login">Log In</a> เพื่อคอมเมนต์'}</div>`);
}

// แสดงรายการโพสต์ใน host (ฟีดรวม หรือเฉพาะของสมาชิกคนหนึ่ง) — คืนตัวควบคุมสำหรับเพิ่มโพสต์ใหม่/โหลดใหม่
async function postList(host,{userId=null}={}){
  host.innerHTML='<div class="plist"></div><div class="npg"></div>';
  const list=host.firstElementChild,more=host.lastElementChild;let page=0;
  const load=async()=>{
    const from=page*FEED_PER;
    let q=sb.from('posts').select('id,user_id,body,image_url,pinned,created_at').order('pinned',{ascending:false}).order('created_at',{ascending:false}).range(from,from+FEED_PER); // ขอเกิน 1 เพื่อรู้ว่ามีหน้าถัดไป
    if(userId)q=q.eq('user_id',userId);
    const{data,error}=await q;
    if(!list.isConnected)return;
    if(error){list.insertAdjacentHTML('beforeend',`<div class="card bad">โหลดโพสต์ไม่สำเร็จ: ${esc(error.message)} (ถ้าเพิ่งเริ่มใช้ ให้รัน community.sql ใน Supabase ก่อน)</div>`);return}
    const rows=data||[],hasMore=rows.length>FEED_PER;rows.splice(FEED_PER);
    const ids=rows.map(r=>r.id);
    const[,st,lk]=await Promise.all([loadProfiles(rows.map(r=>r.user_id)),
      ids.length?sb.from('post_stats').select('post_id,likes,comments').in('post_id',ids):{data:[]},
      user&&ids.length?sb.from('post_likes').select('post_id').eq('user_id',user.id).in('post_id',ids):{data:[]}]);
    if(!list.isConnected)return;
    const S=Object.fromEntries((st.data||[]).map(x=>[x.post_id,x])),L=new Set((lk.data||[]).map(x=>x.post_id));
    list.insertAdjacentHTML('beforeend',rows.map(r=>postHtml(r,{likes:+(S[r.id]?.likes||0),comments:+(S[r.id]?.comments||0)},L.has(r.id))).join(''));
    if(!list.children.length)list.innerHTML='<div class="card mut" data-empty>ยังไม่มีโพสต์'+(userId?'':' — เป็นคนแรกที่โพสต์เลย!')+'</div>';
    more.innerHTML=hasMore?'<button class="ghost">โหลดเพิ่ม</button>':'';
    if(hasMore)more.firstElementChild.onclick=()=>{page++;load()};
  };
  const reload=()=>{page=0;list.innerHTML='';more.innerHTML='';return load()};
  const bump=(el,sel,n)=>{const s=el.querySelector(sel);s.textContent=Math.max(0,+s.textContent+n)};

  list.addEventListener('click',async e=>{
    const t=e.target.closest('[data-act]');if(!t)return;
    const el=t.closest('.post'),id=el.dataset.id,act=t.dataset.act;
    if(act=='zoom')return zoomImg(t.src);
    if(act=='cmt'){const box=el.querySelector('.cbox');box.hidden=!box.hidden;if(!box.hidden&&!box.dataset.ok){box.dataset.ok=1;loadComments(box,id)}return}
    if(act=='like'){
      if(!user)return askLogin();
      if(myProf?.banned)return alert('บัญชีของคุณถูกระงับ');
      const on=t.classList.contains('on');t.classList.toggle('on',!on);t.firstChild.textContent=on?'🤍 ':'❤️ ';bump(t,'span',on?-1:1);
      const{error}=await(on?sb.from('post_likes').delete().eq('post_id',id).eq('user_id',user.id):sb.from('post_likes').insert({post_id:id}));
      if(error){t.classList.toggle('on',on);t.firstChild.textContent=on?'❤️ ':'🤍 ';bump(t,'span',on?1:-1);alert(error.message)}
      return}
    if(act=='del'){
      if(!confirm('ลบโพสต์นี้?'))return;
      const{error}=await sb.from('posts').delete().eq('id',id);if(error)return alert(error.message);
      removeImg(el.dataset.img);el.remove();
      if(!list.children.length)list.innerHTML='<div class="card mut" data-empty>ยังไม่มีโพสต์</div>';return}
    if(act=='pin'){
      const{error}=await sb.from('posts').update({pinned:el.dataset.pin!='1'}).eq('id',id);
      if(error)alert(error.message);else reload();return}
    if(act=='csend'){
      const inp=el.querySelector('.cin'),body=inp.value.trim();if(!body)return;
      t.disabled=true;
      const{data,error}=await sb.from('comments').insert({post_id:id,body}).select('id,user_id,body,created_at').single();
      t.disabled=false;if(error)return alert(error.message);
      inp.value='';await loadProfiles([user.id]);
      el.querySelector('.clist').insertAdjacentHTML('beforeend',commentHtml(data));
      bump(el,'[data-act="cmt"] span',1);return}
    if(act=='cdel'){
      if(!confirm('ลบคอมเมนต์นี้?'))return;
      const c=t.closest('.cm'),{error}=await sb.from('comments').delete().eq('id',c.dataset.cid);
      if(error)return alert(error.message);c.remove();bump(el,'[data-act="cmt"] span',-1)}
  });
  list.addEventListener('keydown',e=>{
    if(e.key=='Enter'&&!e.isComposing&&e.target.classList.contains('cin')){e.preventDefault();e.target.nextElementSibling.click()}});
  await load();
  return{reload,prepend:row=>{list.querySelector('[data-empty]')?.remove();
    const first=[...list.children].find(c=>c.dataset.pin!='1'); // วางต่อจากโพสต์ที่ปักหมุด
    const html=postHtml(row,{likes:0,comments:0},false);
    if(first)first.insertAdjacentHTML('beforebegin',html);else list.insertAdjacentHTML('beforeend',html)}};
}

async function feed(){
  app.innerHTML=`<h2>ฟีดชุมชน</h2>${
    !user?'<div class="card">💬 <a href="#/login">Log In</a> เพื่อโพสต์และคอมเมนต์ (ทุกคนอ่านได้)</div>'
    :myProf?.banned?'<div class="card bad">บัญชีของคุณถูกระงับการโพสต์</div>'
    :`<div class="card cmp"><div class="cmp-top">${avatar({id:user.id,name:meName(),avatar_url:myProf?.avatar_url})}<textarea id="pb" maxlength="5000" placeholder="${esc(meName())} คิดอะไรอยู่…"></textarea></div>
      <div id="pprev"></div><div class="row"><button class="ghost" id="pimg" type="button">🖼️ รูปภาพ</button><input type="file" id="pfile" accept="image/*" hidden><span class="mut" id="pmsg"></span><span style="flex:1"></span><button id="psend">โพสต์</button></div>
      ${myProf?.display_name?'':'<div class="mut">💡 ยังไม่ได้ตั้งชื่อที่แสดง — <a href="#/login">ตั้งชื่อและรูปโปรไฟล์</a></div>'}</div>`}
    <div id="fl"></div>`;
  const pl=await postList($('#fl'));
  if(!$('#psend'))return;
  const pk=imgPick($('#pimg'),$('#pfile'),$('#pprev')),ta=$('#pb'),msg=(t,bad)=>{$('#pmsg').textContent=t||'';$('#pmsg').className='mut'+(bad?' bad':'')};
  $('#psend').onclick=async()=>{
    const body=ta.value.trim(),file=pk.get();if(!body&&!file)return;
    const btn=$('#psend');btn.disabled=true;let url=null;
    try{
      if(file){msg('กำลังอัปโหลดรูป…');url=await uploadImg(file,1280)}
      msg('กำลังโพสต์…');
      const{data,error}=await sb.from('posts').insert({body,image_url:url}).select('id,user_id,body,image_url,pinned,created_at').single();
      if(error){if(url)removeImg(url);throw error}
      PROF.delete(user.id);await loadProfiles([user.id]);
      ta.value='';pk.clear();msg('');pl?.prepend(data);
    }catch(e){msg(e.message||'โพสต์ไม่สำเร็จ',true)}
    btn.disabled=false;
  };
}

// ================= ห้องแชทเรียลไทม์ =================
const CH={tok:0,sub:null,poll:null,cur:null,msgs:[],ids:new Set(),older:false,table:'messages',filter:null};
function chatLeave(){
  CH.tok++;
  if(CH.sub){sb.removeChannel(CH.sub);CH.sub=null}
  if(CH.poll){clearInterval(CH.poll);CH.poll=null}
}
const msgHtml=(m,compact)=>{
  const a=prof(m.user_id),img=okImg(m.image_url),can=user&&(m.user_id==user.id||(isAdmin()&&!CH.cur?.dm));
  return `<div class="msg${compact?' cp':''}${user&&m.user_id==user.id?' own':''}" data-id="${m.id}">${compact?`<span class="mt">${clock(m.created_at)}</span>`:avatar(a)}
  <div class="mb">${compact?'':`<div class="mh"><a href="#/u/${m.user_id}" class="pname">${esc(a.name)}</a>${a.role=='admin'?'<span class="badge a">Admin</span>':''}<span class="mut">${dayLabel(m.created_at)}</span></div>`}
  ${m.body?`<div class="mtx">${rich(m.body)}</div>`:''}${img?`<img class="mimg" src="${esc(img)}" loading="lazy" alt="" data-zoom>`:''}</div>
  ${can?`<button class="ic mdel" data-del="${m.id}" title="ลบข้อความ">🗑️</button>`:''}</div>`};

function paintMsgs(stick){
  const box=$('#msgs');if(!box)return;
  const prevH=box.scrollHeight,prevTop=box.scrollTop;
  let last=null;
  box.innerHTML=(CH.older?'<div class="npg"><button class="ghost" id="older">โหลดข้อความเก่ากว่า</button></div>':'<div class="mut chstart">'+(CH.cur.dm?'จุดเริ่มต้นการสนทนากับ ':'จุดเริ่มต้นของห้อง #')+esc(CH.cur.name)+'</div>')+
    CH.msgs.map(m=>{const compact=last&&last.user_id==m.user_id&&new Date(m.created_at)-new Date(last.created_at)<3e5;last=m;return msgHtml(m,compact)}).join('');
  if(stick)box.scrollTop=box.scrollHeight;else box.scrollTop=prevTop+(box.scrollHeight-prevH);
  const ob=$('#older');if(ob)ob.onclick=loadOlder;
}
async function loadOlder(){
  const b=$('#older');if(b)b.disabled=true;
  const before=CH.msgs[0]?.created_at;
  const{data}=await CH.filter(sb.from(CH.table).select('*')).lt('created_at',before).order('created_at',{ascending:false}).limit(CHAT_PER+1);
  const rows=data||[];CH.older=rows.length>CHAT_PER;rows.splice(CHAT_PER);rows.forEach(r=>r.channel_id=CH.cur.id);
  await loadProfiles(rows.map(r=>r.user_id));
  rows.reverse().forEach(r=>{if(!CH.ids.has(r.id)){CH.ids.add(r.id);CH.msgs.unshift(r)}});
  CH.msgs.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  paintMsgs(false);
}
function addMsg(m,force){
  if(!$('#msgs')||m.channel_id!=CH.cur?.id||CH.ids.has(m.id))return;
  const box=$('#msgs'),near=box.scrollHeight-box.scrollTop-box.clientHeight<120;
  CH.ids.add(m.id);CH.msgs.push(m);CH.msgs.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  if(CH.msgs.length>CHAT_MAX){const d=CH.msgs.shift();CH.ids.delete(d.id);CH.older=true}
  paintMsgs(force||near);
}
function dropMsg(id){
  if(!CH.ids.has(id))return;CH.ids.delete(id);CH.msgs=CH.msgs.filter(m=>m.id!=id);
  const box=$('#msgs'),st=box.scrollTop;paintMsgs(false);box.scrollTop=st;
}

async function chat(slug){
  chatLeave();const tok=CH.tok;
  app.innerHTML='<div class="card mut">กำลังโหลด…</div>';
  const{data:chs,error}=await sb.from('channels').select('*').order('position').order('created_at');
  if(tok!=CH.tok)return;
  if(error){app.innerHTML=`<div class="card bad">โหลดห้องแชทไม่สำเร็จ: ${esc(error.message)} (ถ้าเพิ่งเริ่มใช้ ให้รัน community.sql ใน Supabase ก่อน)</div>`;return}
  if(!chs?.length){app.innerHTML='<div class="card">ยังไม่มีห้องแชท'+(isAdmin()?' — สร้างได้ที่ <a href="#/admin">Admin</a> › ช่องแชท':'')+'</div>';return}
  const cur=chs.find(c=>c.slug==slug)||chs.find(c=>c.slug=='general')||chs[0];
  if(slug!=cur.slug)history.replaceState(null,'','#/chat/'+cur.slug);
  CH.cur=cur;CH.msgs=[];CH.ids=new Set();CH.older=false;CH.table='messages';CH.filter=q=>q.eq('channel_id',cur.id);
  const locked=cur.admin_only_post&&!isAdmin();
  app.innerHTML=`<div class="chat"><aside class="chl"><div class="sec">ห้องแชท</div>${chs.map(c=>`<a href="#/chat/${esc(c.slug)}" class="chi ${c.id==cur.id?'on':''}"><span># ${esc(c.name)}</span>${c.admin_only_post?' 🔒':''}</a>`).join('')}${user?'<a href="#/dm" class="chi"><span>💬 แชทกับเพื่อน</span></a>':''}</aside>
  <section class="chm"><header class="chh"><b># ${esc(cur.name)}</b><span class="mut chd">${esc(cur.description||'')}</span><span class="live" id="live" title="สถานะการเชื่อมต่อ">○ กำลังเชื่อมต่อ</span></header>
  <div class="msgs" id="msgs"><div class="mut" style="padding:12px">กำลังโหลด…</div></div>
  ${!user?'<div class="chf off"><a href="#/login">Log In</a> เพื่อร่วมแชท (ทุกคนอ่านได้)</div>'
   :myProf?.banned?'<div class="chf off bad">บัญชีของคุณถูกระงับการแชท</div>'
   :locked?'<div class="chf off">🔒 ห้องนี้เฉพาะแอดมินเป็นผู้โพสต์</div>'
   :`<div class="chf"><div id="cprev"></div><div class="chrow"><button class="ghost" id="cimg" type="button" title="แนบรูป">🖼️</button><input type="file" id="cfile" accept="image/*" hidden>
     <textarea id="ci" rows="1" maxlength="2000" placeholder="ส่งข้อความใน #${esc(cur.name)}  (Enter = ส่ง, Shift+Enter = ขึ้นบรรทัดใหม่)"></textarea><button id="csend">ส่ง</button></div><div class="mut" id="cmsg"></div></div>`}</section></div>`;

  // โหลดข้อความล่าสุด
  const{data}=await sb.from('messages').select('*').eq('channel_id',cur.id).order('created_at',{ascending:false}).limit(CHAT_PER+1);
  if(tok!=CH.tok)return;
  const rows=data||[];CH.older=rows.length>CHAT_PER;rows.splice(CHAT_PER);rows.reverse();
  await loadProfiles(rows.map(r=>r.user_id));
  if(tok!=CH.tok)return;
  rows.forEach(r=>CH.ids.add(r.id));CH.msgs=rows;paintMsgs(true);
  if(matchMedia('(max-width:700px)').matches)$('.chat')?.scrollIntoView({block:'start'}); // มือถือ: เมนูด้านบนยาว เลื่อนมาที่ห้องแชทเลย

  // เรียลไทม์ + สำรองด้วยการดึงใหม่ทุก 15 วิ (กรณีไม่ได้เปิด Realtime ให้ตาราง messages)
  CH.sub=sb.channel('chat-'+cur.id)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:'channel_id=eq.'+cur.id},async p=>{
      if(tok!=CH.tok)return;await loadProfiles([p.new.user_id]);if(tok==CH.tok)addMsg(p.new)})
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'messages'},p=>{if(tok==CH.tok)dropMsg(p.old.id)})
    .subscribe(s=>{const l=$('#live');if(l){const ok=s=='SUBSCRIBED';l.textContent=ok?'● ออนไลน์':'○ กำลังเชื่อมต่อ';l.classList.toggle('on',ok)}});
  CH.poll=setInterval(async()=>{
    const since=CH.msgs[CH.msgs.length-1]?.created_at;if(!since||document.hidden)return;
    const{data:nw}=await sb.from('messages').select('*').eq('channel_id',cur.id).gt('created_at',since).order('created_at').limit(50);
    if(tok!=CH.tok||!nw?.length)return;await loadProfiles(nw.map(r=>r.user_id));if(tok==CH.tok)nw.forEach(m=>addMsg(m));
  },15000);

  const box=$('#msgs');
  box.addEventListener('click',async e=>{
    const z=e.target.closest('[data-zoom]');if(z)return zoomImg(z.src);
    const d=e.target.closest('[data-del]');if(!d)return;
    if(!confirm('ลบข้อความนี้?'))return;
    const row=d.closest('.msg'),m=CH.msgs.find(x=>x.id==d.dataset.del);
    const{error}=await sb.from('messages').delete().eq('id',d.dataset.del);
    if(error)return alert(error.message);if(m)removeImg(m.image_url);dropMsg(d.dataset.del);
  });

  if(!$('#csend'))return;
  const pk=imgPick($('#cimg'),$('#cfile'),$('#cprev')),ta=$('#ci'),btn=$('#csend');let sending=false;
  const msg=(t,bad)=>{const m=$('#cmsg');if(m){m.textContent=t||'';m.className='mut'+(bad?' bad':'')}};
  const grow=()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,140)+'px'};
  ta.oninput=grow;
  const send=async()=>{
    const body=ta.value.trim(),file=pk.get();if((!body&&!file)||sending)return;
    sending=true;btn.disabled=true;let url=null;
    try{
      if(file){msg('กำลังอัปโหลดรูป…');url=await uploadImg(file,1280)}
      const{data:m,error}=await sb.from('messages').insert({channel_id:cur.id,body,image_url:url}).select().single();
      if(error){if(url)removeImg(url);throw error}
      ta.value='';grow();pk.clear();msg('');await loadProfiles([user.id]);if(tok==CH.tok)addMsg(m,true);
    }catch(e){msg(e.message||'ส่งไม่สำเร็จ',true)}
    sending=false;btn.disabled=false;ta.focus();
  };
  btn.onclick=send;
  ta.onkeydown=e=>{if(e.key=='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send()}};
}

// ================= โปรไฟล์ =================
async function profilePage(id){
  if(!id){if(user)id=user.id;else{location.hash='#/login';return}}
  app.innerHTML='<div class="card mut">กำลังโหลด…</div>';
  const{data:p}=await sb.from('member_profiles').select('*').eq('id',id).maybeSingle();
  if(!p){app.innerHTML='<p><a href="#/feed">← กลับฟีด</a></p><div class="card bad">ไม่พบสมาชิกคนนี้</div>';return}
  PROF.set(p.id,p);
  const[{count},{data:fc}]=await Promise.all([sb.from('posts').select('id',{count:'exact',head:true}).eq('user_id',id),sb.rpc('friend_count',{uid:id})]);
  app.innerHTML=`<p><a href="#/feed">← กลับฟีด</a></p><div class="card prof">${avatar(p,'lg')}<div><h2 style="margin:0">${esc(p.name)} ${p.role=='admin'?'<span class="badge a">Admin</span>':''}${p.banned?'<span class="badge">ถูกระงับ</span>':''}</h2>
    <div class="mut">เข้าร่วมเมื่อ ${new Date(p.created_at).toLocaleDateString('th-TH',{day:'numeric',month:'long',year:'numeric'})} · ${count||0} โพสต์ · ${fc||0} เพื่อน</div>
    ${p.bio?`<p style="white-space:pre-wrap;margin:8px 0 0">${esc(p.bio)}</p>`:''}
    ${user&&user.id==id?'<p><a class="btn" href="#/login">แก้ไขโปรไฟล์</a> <a class="btn" href="#/friends">👥 เพื่อนของฉัน</a></p>':'<p id="fbtn"></p>'}</div></div><h3>โพสต์ของ ${esc(p.name)}</h3><div id="pl"></div>`;
  if($('#fbtn'))friendButton($('#fbtn'),id);
  postList($('#pl'),{userId:id});
}

// หน้าบัญชีของฉัน (index.html เรียกจาก #/login เมื่อล็อกอินแล้ว)
async function myAccount(){
  const uid=user.id;
  app.innerHTML='<div class="card mut">กำลังโหลด…</div>';
  const[{data:L},t,np]=await Promise.all([sb.from('battle_logs').select('result'),
    sb.from('my_tournaments').select('id',{count:'exact',head:true}),
    sb.from('posts').select('id',{count:'exact',head:true}).eq('user_id',uid)]);
  if(!user||user.id!=uid)return;
  const g=(L||[]).length,w=(L||[]).filter(x=>x.result=='win').length;
  const me_={id:uid,name:meName(),avatar_url:myProf?.avatar_url};
  app.innerHTML=`<h2>บัญชีของฉัน</h2>
  <div class="card"><div class="prof">${avatar(me_,'lg')}<div style="flex:1;min-width:0"><b>${esc(user.email)}</b> <span class="badge ${isAdmin()?'a':''}">${isAdmin()?'Admin':'Member'}</span>
    <div class="mut"><a href="#/u/${uid}">ดูโปรไฟล์สาธารณะของฉัน</a></div></div></div></div>
  <div class="card"><b>โปรไฟล์ชุมชน</b>
    <label>ชื่อที่แสดง (ไม่เกิน 30 ตัวอักษร)<input id="dn" maxlength="30" value="${esc(myProf?.display_name||'')}" placeholder="${esc(meName())}"></label>
    <label>แนะนำตัว (ไม่เกิน 300 ตัวอักษร)<textarea id="bio" maxlength="300" style="min-height:70px">${esc(myProf?.bio||'')}</textarea></label>
    <div class="row"><button class="ghost" id="avb" type="button">🖼️ เปลี่ยนรูปโปรไฟล์</button><input type="file" id="avf" accept="image/*" hidden><span id="avp" class="mut"></span></div>
    <div class="row"><button id="psv">บันทึก</button><span class="mut" id="pms"></span></div></div>
  <div class="grid">${[['โพสต์ของฉัน',np.count||0],['เกมที่บันทึก',g],['Win rate',(g?Math.round(w/g*100):0)+'%'],['ทัวร์ของฉัน',t.count||0]].map(([l,v])=>`<div class="card stat"><b>${v}</b><span class="mut">${l}</span></div>`).join('')}</div>
  <button id="out" class="ghost">Log out</button>`;
  $('#out').onclick=async()=>{await sb.auth.signOut();location.hash='#/news'};
  let file=null;
  $('#avb').onclick=()=>$('#avf').click();
  $('#avf').onchange=e=>{file=e.target.files[0]||null;$('#avp').textContent=file?'เลือกแล้ว: '+file.name:''};
  $('#psv').onclick=async()=>{
    const ms=$('#pms'),btn=$('#psv');btn.disabled=true;ms.className='mut';ms.textContent='กำลังบันทึก…';
    let url=null;const old=myProf?.avatar_url||null;
    try{
      if(file)url=await uploadImg(file,256);
      const patch={display_name:$('#dn').value.trim()||null,bio:$('#bio').value.trim()||null};
      if(url)patch.avatar_url=url;
      const{error}=await sb.from('profiles').update(patch).eq('id',uid);
      if(error){if(url)removeImg(url);throw error}
      myProf={...(myProf||{}),...patch};PROF.delete(uid);if(url&&old)removeImg(old);
      ms.textContent='บันทึกแล้ว ✓';myAccount();
    }catch(e){ms.className='bad';ms.textContent=e.message||'บันทึกไม่สำเร็จ'}
    btn.disabled=false;
  };
}

// ================= แอดมิน =================
async function adminMembers(box){
  const{data,error}=await sb.from('profiles').select('id,email,role,banned,display_name,created_at').order('created_at',{ascending:false});
  if(error){box.innerHTML=`<div class="card bad">${esc(error.message)}</div>`;return}
  box.innerHTML=`<div class="card" style="overflow:auto"><table><tr><th>สมาชิก</th><th>Email</th><th>Role</th><th>สถานะ</th><th>สมัครเมื่อ</th><th></th></tr>${(data||[]).map(u=>`<tr>
    <td><a href="#/u/${u.id}">${esc(u.display_name||'สมาชิก-'+u.id.slice(0,4))}</a></td><td>${esc(u.email)}</td><td>${esc(u.role)}</td>
    <td>${u.banned?'<span class="bad">ถูกแบน</span>':'ปกติ'}</td><td>${new Date(u.created_at).toLocaleDateString('th-TH')}</td>
    <td style="white-space:nowrap">${u.id==user.id?'(คุณ)':`<button data-role="${u.id}" data-nr="${u.role=='admin'?'user':'admin'}">${u.role=='admin'?'ถอดสิทธิ์':'ตั้งเป็น admin'}</button> <button class="ghost" data-ban="${u.id}" data-nb="${u.banned?0:1}">${u.banned?'ปลดแบน':'แบน'}</button>`}</td></tr>`).join('')}</table></div>
    <p class="mut">แบน = โพสต์ คอมเมนต์ ไลก์ แชท และอัปโหลดรูปไม่ได้ (ยังอ่านได้) · ลบโพสต์/ข้อความของใครก็ได้ผ่านปุ่ม 🗑️ ในฟีดและห้องแชท</p>`;
  const upd=async(id,patch)=>{const{error}=await sb.from('profiles').update(patch).eq('id',id);if(error)alert(error.message);PROF.delete(id);admin()};
  box.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>upd(b.dataset.role,{role:b.dataset.nr}));
  box.querySelectorAll('[data-ban]').forEach(b=>b.onclick=()=>{
    if(b.dataset.nb=='1'&&!confirm('แบนสมาชิกคนนี้?'))return;upd(b.dataset.ban,{banned:b.dataset.nb=='1'})});
}

async function adminCommunity(box){
  const{data:chs,error}=await sb.from('channels').select('*').order('position').order('created_at');
  if(error){box.innerHTML=`<div class="card bad">${esc(error.message)} (ต้องรัน community.sql ก่อน)</div>`;return}
  box.innerHTML=`<div class="card"><b>สร้างห้องแชทใหม่</b><div class="row two"><label>ชื่อห้อง<input id="cn" maxlength="40" placeholder="เช่น ซื้อขาย"></label><label>slug (a-z 0-9 -) เว้นว่าง = สุ่มให้<input id="cs" maxlength="40" placeholder="trade"></label></div>
    <label>คำอธิบาย<input id="cd" maxlength="200"></label><label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="ca"> เฉพาะแอดมินโพสต์ได้ (ห้องประกาศ)</label><div class="row"><button id="cc">สร้างห้อง</button><span class="mut" id="cm"></span></div></div>
    <div class="card" style="overflow:auto"><table><tr><th>ลำดับ</th><th>ห้อง</th><th>slug</th><th></th></tr>${(chs||[]).map(c=>`<tr><td>${c.position}</td><td><b># ${esc(c.name)}</b>${c.admin_only_post?' 🔒':''}<div class="mut">${esc(c.description||'')}</div></td><td class="mut">${esc(c.slug)}</td>
    <td style="white-space:nowrap"><button class="ghost" data-e="${c.id}">แก้ไข</button> <button class="ghost" data-x="${c.id}">ลบ</button></td></tr>`).join('')||'<tr><td class="mut">ยังไม่มีห้อง</td></tr>'}</table></div>`;
  $('#cc').onclick=async()=>{
    const name=$('#cn').value.trim(),m=$('#cm');if(!name){m.textContent='ใส่ชื่อห้อง';return}
    let slug=$('#cs').value.trim().toLowerCase()||name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||('room-'+Math.random().toString(36).slice(2,6));
    if(!/^[a-z0-9-]{1,40}$/.test(slug)){m.textContent='slug ใช้ได้เฉพาะ a-z 0-9 และ -';return}
    const{error}=await sb.from('channels').insert({name,slug,description:$('#cd').value.trim()||null,admin_only_post:$('#ca').checked,position:(chs||[]).length});
    if(error)m.textContent=error.message.includes('duplicate')?'slug นี้มีแล้ว':error.message;else adminCommunity(box);
  };
  box.querySelectorAll('[data-x]').forEach(b=>b.onclick=async()=>{
    const c=chs.find(x=>x.id==b.dataset.x);
    if(!confirm(`ลบห้อง "${c.name}"?\nข้อความทั้งหมดในห้องนี้จะถูกลบด้วย`))return;
    const{error}=await sb.from('channels').delete().eq('id',c.id);if(error)alert(error.message);adminCommunity(box)});
  box.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>{
    const c=chs.find(x=>x.id==b.dataset.e);
    const m=modal(`<b>แก้ไขห้อง</b><label>ชื่อห้อง<input id="en" maxlength="40" value="${esc(c.name)}"></label><label>คำอธิบาย<input id="ed" maxlength="200" value="${esc(c.description||'')}"></label>
      <label>ลำดับ (เลขน้อยอยู่บน)<input id="ep" type="number" value="${c.position}"></label><label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="ea" ${c.admin_only_post?'checked':''}> เฉพาะแอดมินโพสต์ได้</label>
      <div class="row end"><button class="soft" id="ex">ยกเลิก</button><button id="eo">บันทึก</button></div>`);
    m.querySelector('#ex').onclick=()=>m.remove();
    m.querySelector('#eo').onclick=async()=>{const name=m.querySelector('#en').value.trim();if(!name)return;
      const{error}=await sb.from('channels').update({name,description:m.querySelector('#ed').value.trim()||null,position:+m.querySelector('#ep').value||0,admin_only_post:m.querySelector('#ea').checked}).eq('id',c.id);
      if(error)return alert(error.message);m.remove();adminCommunity(box)};
  });
}


// ================= เพื่อน =================
async function friendRow(otherId){ // ความสัมพันธ์ระหว่างฉันกับอีกคน (null = ยังไม่เกี่ยวข้อง)
  const{data}=await sb.from('friendships').select('id,requester,addressee,status')
    .or(`and(requester.eq.${user.id},addressee.eq.${otherId}),and(requester.eq.${otherId},addressee.eq.${user.id})`).maybeSingle();
  return data;
}
async function friendButton(box,otherId){
  if(!user){box.innerHTML='<a class="btn" href="#/login">Log In เพื่อเพิ่มเพื่อน</a>';return}
  if(!canPost())return;
  const r=await friendRow(otherId);
  const set=(label,fn,ghost)=>{box.innerHTML=`<button class="${ghost?'ghost':''}" id="fb1">${label}</button>`;$('#fb1').onclick=async()=>{$('#fb1').disabled=true;
    const{error}=await fn();if(error)alert(error.message);friendButton(box,otherId);refreshFriendBadge()}};
  if(!r)set('➕ เพิ่มเพื่อน',()=>sb.from('friendships').insert({addressee:otherId}));
  else if(r.status=='accepted'){set('✓ เป็นเพื่อนกัน (เลิกเป็นเพื่อน)',()=>confirm('เลิกเป็นเพื่อนกับคนนี้?')?sb.from('friendships').delete().eq('id',r.id):{},true);
    box.insertAdjacentHTML('beforeend',` <a class="btn" href="#/dm/${otherId}">💬 แชทส่วนตัว</a>`)}
  else if(r.requester==user.id)set('⏳ ส่งคำขอแล้ว (ยกเลิก)',()=>sb.from('friendships').delete().eq('id',r.id),true);
  else{box.innerHTML='<button id="fa">✓ ยอมรับคำขอ</button> <button class="ghost" id="fd">ปฏิเสธ</button>';
    const act=f=>async()=>{const{error}=await f();if(error)alert(error.message);friendButton(box,otherId);refreshFriendBadge()};
    $('#fa').onclick=act(()=>sb.from('friendships').update({status:'accepted'}).eq('id',r.id));
    $('#fd').onclick=act(()=>sb.from('friendships').delete().eq('id',r.id))}
}
async function refreshFriendBadge(){ // ตัวเลขคำขอที่รอตอบบนเมนู
  const el=document.getElementById('fbadge');if(!el)return;
  if(!user){el.textContent='';return}
  const{count}=await sb.from('friendships').select('id',{count:'exact',head:true}).eq('addressee',user.id).eq('status','pending');
  el.textContent=count?` (${count})`:'';
}
const memberRow=(p,right)=>`<div class="card frow"><a href="#/u/${p.id}" class="prof" style="gap:10px;text-decoration:none;color:inherit">${avatar(p)}<b class="pname">${esc(p.name)}</b></a><div class="row">${right}</div></div>`;

async function friends(){
  if(need())return;
  let tab=sessionStorage.getItem('ftab')||'list';
  app.innerHTML=`<h2>👥 เพื่อน</h2>
  <div class="card"><b>ค้นหาสมาชิก</b><div class="row"><input id="fq" placeholder="พิมพ์ชื่อที่แสดง (อย่างน้อย 2 ตัวอักษร)" maxlength="30"><button id="fgo">ค้นหา</button></div><div id="fres"></div></div>
  <div class="ctabs" id="ftabs"></div><div id="fbody"></div>`;
  const search=async()=>{const q=$('#fq').value.trim().replace(/[%_\\,()]/g,'');const box=$('#fres');
    if(q.length<2){box.innerHTML='<p class="mut">พิมพ์อย่างน้อย 2 ตัวอักษร</p>';return}
    box.innerHTML='<p class="mut">กำลังค้นหา…</p>';
    const{data}=await sb.from('member_profiles').select('id,name,avatar_url,role,banned').ilike('name','%'+q+'%').neq('id',user.id).eq('banned',false).limit(20);
    (data||[]).forEach(p=>PROF.set(p.id,p));
    box.innerHTML=(data||[]).length?data.map(p=>memberRow(p,`<span data-fb="${p.id}"></span>`)).join(''):'<p class="mut">ไม่พบสมาชิก</p>';
    box.querySelectorAll('[data-fb]').forEach(sp=>friendButton(sp,sp.dataset.fb))};
  $('#fgo').onclick=search;$('#fq').onkeydown=e=>{if(e.key=='Enter')search()};

  const{data:rows}=await sb.from('friendships').select('id,requester,addressee,status,created_at').order('created_at',{ascending:false});
  const L=rows||[],other=r=>r.requester==user.id?r.addressee:r.requester;
  await loadProfiles(L.map(other));
  const groups={list:L.filter(r=>r.status=='accepted'),in:L.filter(r=>r.status=='pending'&&r.addressee==user.id),out:L.filter(r=>r.status=='pending'&&r.requester==user.id)};
  const names={list:'เพื่อนของฉัน',in:'คำขอที่ได้รับ',out:'คำขอที่ส่งไป'};
  const paint=()=>{sessionStorage.setItem('ftab',tab);
    $('#ftabs').innerHTML=Object.keys(names).map(k=>`<button class="ctab ${tab==k?'on':''}" data-t="${k}">${names[k]} (${groups[k].length})</button>`).join('');
    $('#ftabs').querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{tab=b.dataset.t;paint()});
    const g=groups[tab];
    $('#fbody').innerHTML=g.length?g.map(r=>memberRow(prof(other(r)),
      tab=='in'?`<button data-a="${r.id}">ยอมรับ</button><button class="ghost" data-d="${r.id}">ปฏิเสธ</button>`
      :tab=='out'?`<button class="ghost" data-d="${r.id}">ยกเลิกคำขอ</button>`
      :`<a class="btn" href="#/dm/${other(r)}">💬 แชท</a><button class="ghost" data-d="${r.id}">เลิกเป็นเพื่อน</button>`)).join('')
      :`<div class="card mut">${tab=='list'?'ยังไม่มีเพื่อน ลองค้นหาสมาชิกด้านบนแล้วกดเพิ่มเพื่อนได้เลย':'ไม่มีรายการ'}</div>`;
    $('#fbody').querySelectorAll('[data-a]').forEach(b=>b.onclick=async()=>{b.disabled=true;
      const{error}=await sb.from('friendships').update({status:'accepted'}).eq('id',b.dataset.a);if(error)alert(error.message);friends();refreshFriendBadge()});
    $('#fbody').querySelectorAll('[data-d]').forEach(b=>b.onclick=async()=>{
      if(tab=='list'&&!confirm('เลิกเป็นเพื่อนกับคนนี้?'))return;b.disabled=true;
      const{error}=await sb.from('friendships').delete().eq('id',b.dataset.d);if(error)alert(error.message);friends();refreshFriendBadge()})};
  paint();refreshFriendBadge();
}


// ================= แชทส่วนตัว (เฉพาะเพื่อน เห็นกันแค่ 2 คน) =================
async function dm(peerId){
  if(need())return;
  chatLeave();const tok=CH.tok;
  app.innerHTML='<div class="card mut">กำลังโหลด…</div>';
  const{data:fr,error}=await sb.from('friendships').select('requester,addressee').eq('status','accepted');
  if(tok!=CH.tok)return;
  if(error){app.innerHTML=`<div class="card bad">โหลดไม่สำเร็จ: ${esc(error.message)} (ถ้าเพิ่งเริ่มใช้ ให้รัน friends.sql และ dm.sql ใน Supabase ก่อน)</div>`;return}
  const ids=(fr||[]).map(r=>r.requester==user.id?r.addressee:r.requester);
  await loadProfiles([...ids,peerId]);
  if(tok!=CH.tok)return;
  if(!peerId){
    if(!ids.length){app.innerHTML='<div class="card">ยังไม่มีเพื่อนให้แชทด้วย — <a href="#/friends">ไปเพิ่มเพื่อนก่อน</a></div>';return}
    peerId=ids[0];history.replaceState(null,'','#/dm/'+peerId)}
  if(!ids.includes(peerId)){app.innerHTML='<p><a href="#/friends">← กลับหน้าเพื่อน</a></p><div class="card bad">แชทส่วนตัวใช้ได้เฉพาะคนที่เป็นเพื่อนกันแล้ว</div>';return}
  const peer=prof(peerId);
  CH.cur={id:'dm-'+peerId,name:peer.name,dm:true};CH.msgs=[];CH.ids=new Set();CH.older=false;CH.table='dm_messages';
  CH.filter=q=>q.or(`and(user_id.eq.${user.id},peer_id.eq.${peerId}),and(user_id.eq.${peerId},peer_id.eq.${user.id})`);
  const norm=r=>(r.channel_id=CH.cur.id,r);
  app.innerHTML=`<div class="chat"><aside class="chl"><div class="sec">แชทกับเพื่อน</div>${ids.map(i=>`<a href="#/dm/${i}" class="chi ${i==peerId?'on':''}"><span>${esc(prof(i).name)}</span></a>`).join('')}<a href="#/chat" class="chi"><span># ห้องแชทรวม</span></a></aside>
  <section class="chm"><header class="chh"><b>💬 <a href="#/u/${peerId}" class="pname">${esc(peer.name)}</a></b><span class="mut chd">🔒 เห็นกันแค่ 2 คน</span><span class="live" id="live">○ กำลังเชื่อมต่อ</span></header>
  <div class="msgs" id="msgs"><div class="mut" style="padding:12px">กำลังโหลด…</div></div>
  ${myProf?.banned?'<div class="chf off bad">บัญชีของคุณถูกระงับการแชท</div>':`<div class="chf"><div id="cprev"></div><div class="chrow"><button class="ghost" id="cimg" type="button" title="แนบรูป">🖼️</button><input type="file" id="cfile" accept="image/*" hidden>
    <textarea id="ci" rows="1" maxlength="2000" placeholder="ข้อความถึง ${esc(peer.name)}  (Enter = ส่ง, Shift+Enter = ขึ้นบรรทัดใหม่)"></textarea><button id="csend">ส่ง</button></div><div class="mut" id="cmsg"></div></div>`}</section></div>`;
  const{data}=await CH.filter(sb.from('dm_messages').select('*')).order('created_at',{ascending:false}).limit(CHAT_PER+1);
  if(tok!=CH.tok)return;
  const rows=data||[];CH.older=rows.length>CHAT_PER;rows.splice(CHAT_PER);rows.reverse();rows.forEach(norm);
  await loadProfiles(rows.map(r=>r.user_id));await loadProfiles([user.id]);
  if(tok!=CH.tok)return;
  rows.forEach(r=>CH.ids.add(r.id));CH.msgs=rows;paintMsgs(true);
  if(matchMedia('(max-width:700px)').matches)$('.chat')?.scrollIntoView({block:'start'});
  CH.sub=sb.channel('dm-'+user.id+'-'+peerId)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'dm_messages',filter:'peer_id=eq.'+user.id},p=>{if(tok==CH.tok&&p.new.user_id==peerId)addMsg(norm(p.new))})
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'dm_messages'},p=>{if(tok==CH.tok)dropMsg(p.old.id)})
    .subscribe(st=>{const l=$('#live');if(l){const ok=st=='SUBSCRIBED';l.textContent=ok?'● ออนไลน์':'○ กำลังเชื่อมต่อ';l.classList.toggle('on',ok)}});
  CH.poll=setInterval(async()=>{ // สำรองกรณี Realtime ไม่ทำงาน
    const since=CH.msgs[CH.msgs.length-1]?.created_at;if(!since||document.hidden)return;
    const{data:nw}=await CH.filter(sb.from('dm_messages').select('*')).gt('created_at',since).order('created_at').limit(50);
    if(tok==CH.tok&&nw?.length)nw.forEach(m=>addMsg(norm(m)));
  },15000);
  $('#msgs').addEventListener('click',async e=>{
    const z=e.target.closest('[data-zoom]');if(z)return zoomImg(z.src);
    const d=e.target.closest('[data-del]');if(!d||!confirm('ลบข้อความนี้?'))return;
    const m=CH.msgs.find(x=>x.id==d.dataset.del);
    const{error}=await sb.from('dm_messages').delete().eq('id',d.dataset.del);
    if(error)return alert(error.message);if(m)removeImg(m.image_url);dropMsg(d.dataset.del);
  });
  if(!$('#csend'))return;
  const pk=imgPick($('#cimg'),$('#cfile'),$('#cprev')),ta=$('#ci'),btn=$('#csend');let sending=false;
  const msg=(t,bad)=>{const m=$('#cmsg');if(m){m.textContent=t||'';m.className='mut'+(bad?' bad':'')}};
  const grow=()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,140)+'px'};ta.oninput=grow;
  const send=async()=>{
    const body=ta.value.trim(),file=pk.get();if((!body&&!file)||sending)return;
    sending=true;btn.disabled=true;let url=null;
    try{
      if(file){msg('กำลังอัปโหลดรูป…');url=await uploadImg(file,1280)}
      const{data:m,error}=await sb.from('dm_messages').insert({peer_id:peerId,body,image_url:url}).select().single();
      if(error){if(url)removeImg(url);throw error}
      ta.value='';grow();pk.clear();msg('');if(tok==CH.tok)addMsg(norm(m),true);
    }catch(e){msg(e.message||'ส่งไม่สำเร็จ (ต้องเป็นเพื่อนกัน)',true)}
    sending=false;btn.disabled=false;ta.focus();
  };
  btn.onclick=send;ta.onkeydown=e=>{if(e.key=='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send()}};
}
