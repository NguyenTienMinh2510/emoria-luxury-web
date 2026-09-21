import React,{useEffect,useState} from 'react';
import {apiRequest} from '../services/apiClient.js';
import {useLanguage} from '../i18n/LanguageProvider.jsx';

export default function AccountPicker({value,onChange,disabled=false}){
  const {t}=useLanguage();
  const [search,setSearch]=useState(''),[rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    let active=true;const timer=setTimeout(()=>{
      setBusy(true);setError('');apiRequest('/admin/accounts?'+new URLSearchParams({search})).then(data=>{if(active)setRows(data);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});
    },250);return()=>{active=false;clearTimeout(timer);};
  },[search]);
  return <div className="space-y-2 min-w-0">
    <label className="store-label">{t('Tìm tài khoản','Find an account')}<input className="store-input" type="search" maxLength={120} value={search} disabled={disabled} onChange={e=>setSearch(e.target.value)} placeholder={t('Tên, email hoặc User ID','Name, email or User ID')}/></label>
    <label className="store-label">{t('Tài khoản được chọn','Selected account')}<select className="store-input" disabled={disabled||busy} value={value?.id||''} onChange={e=>onChange(rows.find(row=>row.id===e.target.value)||null)}><option value="">{t('Chọn tài khoản…','Select an account…')}</option>{value&&!rows.some(row=>row.id===value.id)&&<option value={value.id}>{value.full_name||value.email||value.id}</option>}{rows.map(row=><option key={row.id} value={row.id}>{row.full_name||row.email} · {row.email||row.id}</option>)}</select></label>
    {value&&<p className="text-xs text-slate-400 break-all">User ID: {value.id}</p>}
    {error&&<p role="alert" className="text-red-300 text-sm">{error}</p>}
  </div>;
}
