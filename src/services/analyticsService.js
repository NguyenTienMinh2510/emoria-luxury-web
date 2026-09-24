import { track } from '@vercel/analytics';

const consentKey='emoria_analytics_consent';
let measurementId='', enabled=false;
const analyticsEnv=import.meta.env||{};
export function analyticsEligible(settings,privateView=false){
 const host=analyticsEnv.VITE_GA4_HOSTNAME;
 return Boolean(settings&&!privateView&&(!settings.sandbox||analyticsEnv.VITE_GA4_TRACK_SANDBOX==='true')&&(!host||location.hostname===host));
}
export function setAnalyticsConsent(value){try{localStorage.setItem(consentKey,value?'granted':'denied');}catch{}window.dispatchEvent(new Event('analytics-consent'));}
export function getAnalyticsConsent(){try{return localStorage.getItem(consentKey);}catch{return null;}}
export function configureAnalytics(settings,privateView=false){
 measurementId=settings?.ga4_measurement_id||(typeof import.meta !== 'undefined' && import.meta.env?.VITE_GA4_MEASUREMENT_ID)||'';
 enabled=Boolean(/^G-[A-Z0-9]{4,20}$/.test(measurementId)&&analyticsEligible(settings,privateView)&&getAnalyticsConsent()==='granted');
 if(measurementId)window[`ga-disable-${measurementId}`]=!enabled;
 if(!enabled)return;
 window.dataLayer=window.dataLayer||[];
 window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
 if(!document.getElementById('emoria-ga4')){
  const script=document.createElement('script');script.id='emoria-ga4';script.async=true;script.src=`https://www.googletagmanager.com/gtag/js?id=${measurementId}`;document.head.appendChild(script);
  window.gtag('js',new Date());
  window.gtag('config',measurementId,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,page_location:location.origin+'/',page_referrer:''});
 }
}
export function trackShopEvent(event,items=[],extra={}){
 if(getAnalyticsConsent()==='granted'){
  try{
   const totalValue=items.reduce((n,i)=>n+(Number(i.price)||0)*(Number(i.quantity)||1),0);
   track(event,{
    page:extra.page||'EMORIA',
    items_count:items.length,
    ...(totalValue?{value:totalValue}:{}),
    ...(items[0]?.name?{item:items[0].name}:{})
   });
  }catch{}
 }
 if(!enabled || !window.gtag)return;
 if(!['view_item','add_to_cart','begin_checkout','order_created','page_view'].includes(event))return;
 const clean=items.map(i=>({item_id:i.id,item_name:i.name,price:Number(i.price),quantity:Number(i.quantity||1)}));
 window.gtag('event',event,{send_to:measurementId,currency:'VND',...(clean.length?{items:clean,value:clean.reduce((n,i)=>n+i.price*i.quantity,0)}:{}),page_location:location.origin+(extra.page==='article'?'/articles':extra.page==='shop'?'/shop':'/'),page_title:extra.page||'EMORIA',page_referrer:''});
}
