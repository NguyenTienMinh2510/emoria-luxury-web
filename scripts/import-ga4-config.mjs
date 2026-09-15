import fs from 'node:fs';
import {createPrivateKey} from 'node:crypto';
import {loadEnv} from 'vite';

const property=process.argv[2];
if(!/^\d+$/.test(property||''))throw new Error('Cách dùng: node scripts/import-ga4-config.mjs PROPERTY_ID_DANG_SO');
const file='.local/ga4-service-account.json';
if(!fs.existsSync(file))throw new Error('Đặt tệp JSON tải từ Google vào .local/ga4-service-account.json trước.');
let credentials;
try{credentials=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));if(credentials.type!=='service_account'||!credentials.client_email?.endsWith('.iam.gserviceaccount.com'))throw new Error();createPrivateKey(credentials.private_key);}catch{throw new Error('Tệp JSON không phải khóa service account hợp lệ. Không in nội dung khóa để chẩn đoán.');}
const serialized=JSON.stringify(credentials);
if(serialized.includes("'"))throw new Error('JSON chứa ký tự không phù hợp để ghi vào .env.');
const envFile='.env';
const old=fs.existsSync(envFile)?fs.readFileSync(envFile,'utf8'):'';
if(/^\s*GA4_SERVICE_ACCOUNT_JSON\s*=.+$/m.test(old)||/^\s*GA4_PROPERTY_ID\s*=.+$/m.test(old))throw new Error('Đã có cấu hình GA4 trong .env. Không ghi đè; hãy kiểm tra cấu hình hiện tại.');
const next=old.replace(/^\s*GA4_SERVICE_ACCOUNT_JSON\s*=\s*$/gm,'').replace(/^\s*GA4_PROPERTY_ID\s*=\s*$/gm,'').trimEnd()+`\n\n# GA4 reporting — server only\nGA4_PROPERTY_ID=${property}\nGA4_SERVICE_ACCOUNT_JSON='${serialized}'\n`;
fs.writeFileSync(envFile,next);
const loaded=loadEnv('sandbox',process.cwd(),'');
try{if(loaded.GA4_PROPERTY_ID!==property||JSON.parse(loaded.GA4_SERVICE_ACCOUNT_JSON).private_key!==credentials.private_key)throw new Error();}catch{fs.writeFileSync(envFile,old);throw new Error('Biến GA4 bị cấu hình khác ghi đè. Đã khôi phục .env; kiểm tra .env.local/.env.sandbox.local.');}
console.log('Đã ghi và kiểm tra cú pháp GA4 server config. Không hiển thị khóa. Khởi động lại Vite rồi mở Admin → Marketing → Tải báo cáo GA4.');
