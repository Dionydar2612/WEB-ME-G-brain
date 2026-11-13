// อ่านค่าจาก .env (ในเครื่อง) หรือ Environment Variables (บน Render) แล้วสร้าง config.js
const fs=require('fs');
if(fs.existsSync('.env'))for(const l of fs.readFileSync('.env','utf8').split('\n')){
  const m=l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,'');}
const{SUPABASE_URL,SUPABASE_KEY}=process.env;
if(!SUPABASE_URL||!SUPABASE_KEY){console.error('ต้องตั้ง SUPABASE_URL และ SUPABASE_KEY');process.exit(1)}
fs.writeFileSync('config.js',`const SITE="จี่สมอง";\nconst SUPABASE_URL=${JSON.stringify(SUPABASE_URL)};\nconst SUPABASE_KEY=${JSON.stringify(SUPABASE_KEY)};\n`);
console.log('config.js generated');
