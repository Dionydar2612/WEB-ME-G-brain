// ดึงโพสต์จาก Facebook Page ไปใส่ตาราง news (ใช้ service_role key — ห้ามใส่ในเว็บ ใช้บนเซิร์ฟเวอร์/GitHub Actions เท่านั้น)
const{FB_PAGE_ID,FB_PAGE_TOKEN,SUPABASE_URL,SUPABASE_SERVICE_KEY:K}=process.env;
(async()=>{
  if(!FB_PAGE_ID||!FB_PAGE_TOKEN||!SUPABASE_URL||!K){console.error('ตั้งค่า env ไม่ครบ');process.exit(1)}
  const r=await fetch(`https://graph.facebook.com/v21.0/${FB_PAGE_ID}/posts?fields=id,message,created_time,permalink_url,full_picture&limit=20&access_token=${FB_PAGE_TOKEN}`);
  const j=await r.json();
  if(j.error){console.error('Facebook error:',j.error.message);process.exit(1)}
  const rows=(j.data||[]).filter(p=>p.message||p.full_picture).map(p=>({
    fb_post_id:p.id,title:(p.message||'โพสต์จาก Facebook').split('\n')[0].slice(0,120),body:p.message||'',
    source_url:p.permalink_url,image_url:p.full_picture||null,created_at:p.created_time}));
  if(!rows.length){console.log('ไม่มีโพสต์ใหม่');return}
  const s=await fetch(`${SUPABASE_URL}/rest/v1/news?on_conflict=fb_post_id`,{method:'POST',
    headers:{apikey:K,Authorization:`Bearer ${K}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},body:JSON.stringify(rows)});
  if(!s.ok){console.error('Supabase error:',await s.text());process.exit(1)}
  console.log(`ซิงก์ ${rows.length} โพสต์`);
})();
