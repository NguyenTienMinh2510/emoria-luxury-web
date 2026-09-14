import React from 'react';
const safeUrl=url=>/^(https?:\/\/|\/(?!\/))/.test(url)?url:null;
function inline(text){return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((part,i)=>{
 if(part.startsWith('**'))return <strong key={i}>{part.slice(2,-2)}</strong>;
 const link=part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);if(link&&safeUrl(link[2]))return <a key={i} className="underline" href={safeUrl(link[2])} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
 return part;
});}
export default function MarkdownContent({content=''}){
 return <div className="space-y-5 text-slate-300 leading-loose break-words">{content.split(/\n\s*\n/).map((block,i)=>{
  const image=block.match(/^!\[([^\]]*)\]\(([^)]+)\)(?:\n(.+))?$/);
  if(image&&safeUrl(image[2]))return <figure key={i}><img className="max-h-[500px] rounded-xl mx-auto" src={safeUrl(image[2])} alt={image[1]} loading="lazy"/>{image[3]&&<figcaption className="text-center text-sm">{image[3]}</figcaption>}</figure>;
  const heading=block.match(/^(#{1,3}) (.+)$/);if(heading)return <h2 key={i} className="font-serif text-2xl text-white pt-4">{inline(heading[2])}</h2>;
  if(block.startsWith('> '))return <blockquote key={i} className="border-l-2 border-white/40 pl-5 italic">{inline(block.replace(/^> /gm,''))}</blockquote>;
  if(/^(- |\d+\. )/.test(block))return <ul key={i} className="list-disc pl-5">{block.split('\n').map((line,j)=><li key={j}>{inline(line.replace(/^(- |\d+\. )/,''))}</li>)}</ul>;
  return <p key={i} className="whitespace-pre-line">{inline(block)}</p>;
 })}</div>;
}
