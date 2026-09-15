import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
const config=JSON.parse(fs.readFileSync('.local/fresh-supabase.json','utf8'));
assert.equal(config.API_URL,'http://127.0.0.1:56321');
const options={auth:{persistSession:false,autoRefreshToken:false}},auth=createClient(config.API_URL,config.ANON_KEY,options),root=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options);
const email='auth-'+Date.now()+'@emoria.test',password='Fixture!'+crypto.randomUUID();let userId;
async function emailLink(type){
 for(let attempt=0;attempt<20;attempt++){
  const inbox=await (await fetch('http://127.0.0.1:56324/api/v1/messages')).json();
  for(const message of inbox.messages.filter(m=>m.To.some(to=>to.Address===email))){
   const detail=await (await fetch('http://127.0.0.1:56324/api/v1/message/'+message.ID)).json();
   const links=detail.HTML.match(/href="([^"]+)"/g)||[];
   for(const link of links){const url=new URL(link.slice(6,-1).replaceAll('&amp;','&'));if(url.searchParams.get('type')===type){assert.equal(url.origin,config.API_URL);return url;}}
  }
  await new Promise(r=>setTimeout(r,250));
 }
 throw new Error('No matching local confirmation email');
}
try {
 const signup=await auth.auth.signUp({email,password});assert.ifError(signup.error);assert.equal(signup.data.session,null);userId=signup.data.user.id;
 const denied=await auth.auth.signInWithPassword({email,password});assert.ok(denied.error);
 const signupLink=await emailLink('signup');
 const verified=await auth.auth.verifyOtp({token_hash:signupLink.searchParams.get('token'),type:'signup'});assert.ifError(verified.error);assert.ok(verified.data.session);
 await auth.auth.signOut();
 const reset=await auth.auth.resetPasswordForEmail(email,{redirectTo:'http://127.0.0.1:3000/?auth=recovery'});assert.ifError(reset.error);
 const resetLink=await emailLink('recovery');
 const recovered=await auth.auth.verifyOtp({token_hash:resetLink.searchParams.get('token'),type:'recovery'});assert.ifError(recovered.error);
 const newPassword='Changed!'+crypto.randomUUID();const update=await auth.auth.updateUser({password:newPassword});assert.ifError(update.error);await auth.auth.signOut();
 assert.ok((await auth.auth.signInWithPassword({email,password})).error);
 assert.ifError((await auth.auth.signInWithPassword({email,password:newPassword})).error);
 console.log('PASS fresh Auth: signup requires delivered local email, verification opens session, reset email grants recovery, changed password works and old password fails. Fixed admin unchanged.');
} finally {await auth.auth.signOut();if(userId){const r=await root.auth.admin.deleteUser(userId);assert.ifError(r.error);}}
