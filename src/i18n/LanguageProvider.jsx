import React,{createContext,useContext,useEffect,useState} from 'react';
export function readLanguage(){try{return localStorage.getItem('emoria_language')==='en'?'en':'vi';}catch{return 'vi';}}
export function translate(language,vi,en,values={}){
  return (language==='en'?en:vi).replace(/\{(\w+)\}/g,(match,key)=>String(values[key]??match));
}
const LanguageContext=createContext({language:'vi',setLanguage:()=>{},t:(vi,en,values)=>translate('vi',vi,en,values),locale:'vi-VN'});
export const useLanguage=()=>useContext(LanguageContext);
export default function LanguageProvider({children,initialLanguage}){
  const [language,setLanguage]=useState(()=>initialLanguage==='en'?'en':initialLanguage==='vi'?'vi':readLanguage());
  useEffect(()=>{document.documentElement.lang=language;try{localStorage.setItem('emoria_language',language);}catch{}},[language]);
  return <LanguageContext.Provider value={{language,setLanguage:next=>setLanguage(next==='en'?'en':'vi'),locale:language==='en'?'en-US':'vi-VN',t:(vi,en,values)=>translate(language,vi,en,values)}}>{children}</LanguageContext.Provider>;
}
export function LanguageSwitcher(){
  const {language,setLanguage,t}=useLanguage();
  return <select aria-label={t('Ngôn ngữ','Language')} value={language} onChange={event=>setLanguage(event.target.value)} className="rounded-lg border border-white/20 bg-dark-950 text-white text-xs min-h-10 px-2 max-w-20"><option value="vi">VI</option><option value="en">EN</option></select>;
}
