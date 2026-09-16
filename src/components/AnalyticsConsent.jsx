import React,{useEffect,useState} from 'react';
import {configureAnalytics,getAnalyticsConsent,setAnalyticsConsent,trackShopEvent} from '../services/analyticsService';
export default function AnalyticsConsent({settings,view,isAdmin}){
 const [consent,setConsent]=useState(getAnalyticsConsent);
 useEffect(()=>{const update=()=>setConsent(getAnalyticsConsent());window.addEventListener('analytics-consent',update);return()=>window.removeEventListener('analytics-consent',update);},[]);
 useEffect(()=>{configureAnalytics(settings,['memory','admin'].includes(view)||isAdmin);if(!['memory','admin'].includes(view)&&!isAdmin)trackShopEvent('page_view',[],{page:view==='article-detail'?'article':view});},[settings,view,consent,isAdmin]);
 if(!settings?.ga4_measurement_id||settings.sandbox||['memory','admin'].includes(view)||isAdmin)return null;
 if(consent)return <button className="fixed bottom-1 right-4 z-30 text-[10px] text-slate-400" onClick={()=>{try{localStorage.removeItem('emoria_analytics_consent');}catch{}setConsent(null);configureAnalytics(settings,true);}}>Tùy chọn thống kê</button>;
 return <div className="fixed bottom-20 right-4 left-4 sm:left-auto sm:w-96 z-[70] glass-panel bg-dark-900 p-5 rounded-2xl text-sm"><p>Cho phép thống kê truy cập cửa hàng bằng Google Analytics để cải thiện trải nghiệm? Memory Space riêng tư không được đo lường.</p><div className="flex gap-3 mt-4"><button className="store-button" onClick={()=>setAnalyticsConsent(true)}>Đồng ý</button><button onClick={()=>setAnalyticsConsent(false)}>Từ chối</button></div></div>;
}
