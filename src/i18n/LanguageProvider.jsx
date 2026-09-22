import React,{createContext,useContext,useEffect,useState} from 'react';
export function readLanguage(){try{return localStorage.getItem('emoria_language')==='en'?'en':'vi';}catch{return 'vi';}}
export function translate(language,vi,en,values={}){
  return (language==='en'?en:vi).replace(/\{(\w+)\}/g,(match,key)=>String(values[key]??match));
}
export function translateBilingual(language,vi,en,separator=' · ',values={}){
  const resolvedVi = vi.replace(/\{(\w+)\}/g,(match,key)=>String(values[key]??match));
  const resolvedEn = (en || '').replace(/\{(\w+)\}/g,(match,key)=>String(values[key]??match));
  if (language !== 'en' || !resolvedEn || resolvedEn === resolvedVi) {
    return resolvedVi;
  }
  return `${resolvedVi}${separator}${resolvedEn}`;
}
const LanguageContext=createContext({
  language:'vi',
  setLanguage:()=>{},
  t:(vi,en,values)=>translate('vi',vi,en,values),
  tBilingual:(vi,en,separator,values)=>translateBilingual('vi',vi,en,separator,values),
  locale:'vi-VN'
});
export const useLanguage=()=>useContext(LanguageContext);

export function BilingualText({ vi, en, className = '', subClassName = 'text-xs text-amber-200/80 italic font-light' }) {
  const { language } = useLanguage();
  if (language !== 'en' || !en || en === vi) {
    return <span className={className}>{vi}</span>;
  }
  return (
    <span className={`inline-flex flex-col ${className}`}>
      <span>{vi}</span>
      <span className={subClassName}>{en}</span>
    </span>
  );
}

export function suppressGoogleTranslateBanner() {
  if (typeof document === 'undefined') return;
  try {
    if (document.body && document.body.style.top && document.body.style.top !== '0px') {
      document.body.style.setProperty('top', '0px', 'important');
      document.body.style.setProperty('position', 'static', 'important');
    }
    const banners = document.querySelectorAll(
      '.goog-te-banner-frame, iframe.goog-te-banner-frame, iframe[class*="VIpgJd"], iframe[id*=":container"], iframe.skiptranslate, #goog-gt-tt, .goog-te-balloon-frame, .VIpgJd-ZVi9od-ORHb-Oxf9ae'
    );
    banners.forEach(b => {
      b.style.setProperty('display', 'none', 'important');
      b.style.setProperty('visibility', 'hidden', 'important');
      b.style.setProperty('height', '0px', 'important');
      b.style.setProperty('opacity', '0', 'important');
      b.style.setProperty('pointer-events', 'none', 'important');
      b.style.setProperty('top', '-99999px', 'important');
      b.style.setProperty('position', 'absolute', 'important');
    });
  } catch (err) {
    /* ignore */
  }
}

export function syncGoogleTranslate(targetLang) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  try {
    const val = targetLang === 'en' ? '/vi/en' : '/vi/vi';
    document.cookie = `googtrans=${val}; path=/;`;
    const host = window.location.hostname;
    if (host && host !== 'localhost') {
      document.cookie = `googtrans=${val}; path=/; domain=.${host};`;
    }

    const applyCombo = () => {
      const combo = document.querySelector('.goog-te-combo');
      if (combo && combo.value !== targetLang) {
        combo.value = targetLang;
        combo.dispatchEvent(new Event('change'));
        suppressGoogleTranslateBanner();
        return true;
      }
      return false;
    };

    if (!applyCombo()) {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (applyCombo() || attempts > 12) {
          clearInterval(interval);
          suppressGoogleTranslateBanner();
        }
      }, 250);
    }
    suppressGoogleTranslateBanner();
  } catch (err) {
    /* Safe fallback */
  }
}

export function clearGoogleTranslateCookies() {
  if (typeof document === 'undefined') return;
  try {
    document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    if (host && host !== 'localhost') {
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${host};';
    }
    suppressGoogleTranslateBanner();
  } catch (err) {
    /* ignore */
  }
}

export default function LanguageProvider({children,initialLanguage}){
  const [language,setLanguage]=useState(()=>initialLanguage==='en'?'en':initialLanguage==='vi'?'vi':readLanguage());
  useEffect(()=>{
    document.documentElement.lang=language;
    try{localStorage.setItem('emoria_language',language);}catch{}
    syncGoogleTranslate(language);
    suppressGoogleTranslateBanner();
  },[language]);
  return (
    <LanguageContext.Provider value={{
      language,
      setLanguage:next=>setLanguage(next==='en'?'en':'vi'),
      locale:language==='en'?'en-US':'vi-VN',
      t:(vi,en,values)=>translate(language,vi,en,values),
      tBilingual:(vi,en,separator,values)=>translateBilingual(language,vi,en,separator,values)
    }}>
      {children}
    </LanguageContext.Provider>
  );
}
export function LanguageSwitcher(){
  const {language,setLanguage,t}=useLanguage();
  return <select aria-label={t('Ngôn ngữ','Language')} value={language} onChange={event=>setLanguage(event.target.value)} className="rounded-lg border border-white/20 bg-dark-950 text-white text-xs min-h-10 px-2 max-w-20"><option value="vi">VI</option><option value="en">EN</option></select>;
}

