import React,{useEffect,useState} from 'react';
import {apiRequest} from '../services/apiClient';
import {useLanguage} from '../i18n/LanguageProvider';
export default function NfcLanding({chipId,onResolved,onMyMemories}){
 const {t}=useLanguage();const [error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;setError('');apiRequest(`/nfc-chips/${encodeURIComponent(chipId)}`).then(data=>{if(active)onResolved(data.tag_uid);}).catch(e=>{if(active)setError(e.status===404?t('Chip chưa được gán, đã tắt hoặc kỷ vật đang tạm khóa.','This chip is unassigned, disabled, or its memory is suspended.'):e.message);});return()=>{active=false;};},[chipId,retry]);
 return <section className="min-h-screen max-w-xl mx-auto px-5 py-32 space-y-5"><h1 className="font-serif text-3xl">{t('Mở kỷ vật từ chip','Open memory from chip')}</h1>{error?<><p role="alert">{error}</p><button className="store-button" onClick={()=>setRetry(n=>n+1)}>{t('Thử lại','Retry')}</button></>:<p role="status">{t('Đang tìm kỷ vật…','Finding your memory…')}</p>}<button className="store-button" onClick={onMyMemories}>{t('Kỷ vật trong tài khoản','My account memories')}</button></section>;
}
