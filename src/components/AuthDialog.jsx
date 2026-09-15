import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import ModalFrame from './ModalFrame';
import CustomerOrders from './CustomerOrders';
export default function AuthDialog({ isOpen, onClose, onLoginSuccess, currentUser, recovery = false }) {
 const [mode,setMode]=useState('login'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{if(recovery)setMode('reset');},[recovery]);
 if(!isOpen)return null;
 const submit=async e=>{
  e.preventDefault();if(busy)return;setBusy(true);setError('');setMessage('');
  try{
   if(!isSupabaseConfigured())throw new Error('Chưa kết nối máy chủ. Hãy khởi động môi trường thử nghiệm.');
   const redirectTo=new URL('/?auth=recovery',window.location.origin).href;
   if(mode==='forgot'){
    const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo});if(error)throw error;
    setMessage('Nếu email đã đăng ký, liên kết đặt lại mật khẩu sẽ được gửi.');
   }else if(mode==='reset'){
    const {data,error}=await supabase.auth.updateUser({password});if(error)throw error;
    setMessage('Đã đổi mật khẩu.');setPassword('');setMode('login');onLoginSuccess?.(data.user.user_metadata?.full_name||data.user.email);
   }else if(mode==='register'){
    const {data,error}=await supabase.auth.signUp({email:email.trim(),password,options:{data:{full_name:name.trim()},emailRedirectTo:window.location.origin}});if(error)throw error;
    if(data.session){onLoginSuccess?.(data.user.user_metadata?.full_name||data.user.email);onClose();}
    else setMessage('Hãy mở email xác minh để kích hoạt tài khoản.');
   }else{
    const {data,error}=await supabase.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;
    onLoginSuccess?.(data.user.user_metadata?.full_name||data.user.email);setPassword('');onClose();
   }
  }catch(err){setError(err.message==='Invalid login credentials'?'Email hoặc mật khẩu không đúng.':err.message);}finally{setBusy(false);}
 };
 return <ModalFrame title="Tài khoản EMORIA" onClose={onClose}>
 {error&&<p role="alert" className="p-3 mb-4 bg-red-500/10 text-red-300 rounded-xl text-sm">{error}</p>}
 {message&&<p role="status" className="p-3 mb-4 bg-emerald-500/10 text-emerald-200 rounded-xl text-sm">{message}</p>}
 {currentUser && mode!=='reset'?<div className="space-y-4"><p>Xin chào, {currentUser}</p><button className="store-button" onClick={async()=>{const {error}=await supabase.auth.signOut();if(error){setError(error.message);return;}onLoginSuccess?.(null);onClose();}}>Đăng xuất</button><CustomerOrders/></div>:<>
 <p className="text-slate-400 text-sm mb-5">{({login:'Đăng nhập để quản lý đơn hàng và ký ức.',register:'Tạo tài khoản bằng email của bạn.',forgot:'Nhận liên kết đặt lại mật khẩu.',reset:'Nhập mật khẩu mới.'})[mode]}</p>
 <form onSubmit={submit} className="space-y-4">
 {mode==='register'&&<label className="store-label">Họ và tên<input required maxLength={120} autoComplete="name" value={name} onChange={e=>setName(e.target.value)} className="store-input" /></label>}
 {mode!=='reset'&&<label className="store-label">Email<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="store-input" /></label>}
 {mode!=='forgot'&&<label className="store-label">Mật khẩu<input type="password" required minLength={8} autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} className="store-input" /></label>}
 <button disabled={busy} className="store-button w-full">{busy?'Đang xử lý…':({login:'Đăng nhập',register:'Đăng ký',forgot:'Gửi liên kết',reset:'Lưu mật khẩu mới'})[mode]}</button>
 </form>
 <div className="flex justify-between gap-3 text-sm mt-5"><button onClick={()=>{setMode(mode==='login'?'register':'login');setMessage('');setError('');}}>{mode==='login'?'Tạo tài khoản':'Về đăng nhập'}</button><button onClick={()=>setMode('forgot')}>Quên mật khẩu?</button></div></>}
 </ModalFrame>;
}
