import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const raw=execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','status','--workdir','local-stack','-o','json'],{encoding:'utf8'});
const config=JSON.parse(raw.slice(raw.indexOf('{')));
if(new URL(config.API_URL).hostname!=='127.0.0.1' || !config.API_URL.endsWith(':55321'))throw new Error('Only the isolated EMORIA localhost stack is allowed.');
fs.mkdirSync('.local',{recursive:true});
fs.writeFileSync('.local/supabase.json',JSON.stringify(config,null,2));
fs.writeFileSync('.env.sandbox.local',`VITE_SUPABASE_URL=${config.API_URL}\nVITE_SUPABASE_ANON_KEY=${config.ANON_KEY}\nVITE_SUPABASE_PUBLISHABLE_KEY=\nVITE_APP_MODE=sandbox\nSUPABASE_SERVICE_ROLE_KEY=${config.SERVICE_ROLE_KEY}\n`);
const admin=createClient(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const credentials=fs.existsSync('.local/accounts.json')?JSON.parse(fs.readFileSync('.local/accounts.json','utf8')):{password:'Emoria!'+crypto.randomBytes(9).toString('base64url'),users:[]};
for(const [email,name,role] of [['admin@emoria.test','Quản trị thử nghiệm','admin'],['owner@emoria.test','Chủ kỷ vật thử nghiệm','owner'],['viewer@emoria.test','Khách thử nghiệm','viewer']]){
 let user=credentials.users.find(u=>u.email===email);
 if(!user){const {data,error}=await admin.auth.admin.createUser({email,password:credentials.password,email_confirm:true,user_metadata:{full_name:name}});if(error)throw error;user={id:data.user.id,email,name,role};credentials.users.push(user);fs.writeFileSync('.local/accounts.json',JSON.stringify(credentials,null,2));}
 if(role==='admin'){const {error}=await admin.from('role_assignments').upsert({user_id:user.id,role:'admin'},{onConflict:'user_id,role'});if(error)throw error;}
 if(role==='owner'){const {error}=await admin.from('memory_spaces').update({owner_id:user.id}).eq('tag_uid','emoria-lumen').is('owner_id',null);if(error)throw error;}
}
fs.writeFileSync('.local/TAI-KHOAN-THU-NGHIEM.md',`# Tài khoản local — chỉ dùng với EMORIA sandbox\n\n${credentials.users.map(u=>`- ${u.email} (${u.role})`).join('\n')}\n\nMật khẩu thử nghiệm: ${credentials.password}\n\nCửa hàng: http://127.0.0.1:3000\nHộp thư xác minh/reset thử nghiệm: http://127.0.0.1:55324\n\nKhông dùng các tài khoản này cho production.\n`);
console.log('Sandbox configured. Local account guide: .local/TAI-KHOAN-THU-NGHIEM.md. Cloud untouched.');
