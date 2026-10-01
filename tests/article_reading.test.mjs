import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Exercise the real detail view effects across parent rerenders without a browser.
const fixture = {state:[],deps:[],cleanups:[],pending:[],calls:[]};
globalThis.articleFixture = fixture;
const {outputFiles} = await build({
  entryPoints:['src/views/ArticleDetailView.jsx'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent',
  plugins:[{name:'article-fixture',setup(builder){
    builder.onResolve({filter:/^(react|framer-motion|lucide-react)$|articleService$|StoreProvider$|LanguageProvider$|aiTranslationService$|MarkdownContent$/},args=>({path:args.path,namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:
      path==='react'?`
        const f=globalThis.articleFixture;
        export function useState(value){const i=f.stateCursor++;if(!(i in f.state))f.state[i]=value;return [f.state[i],next=>{f.state[i]=typeof next==='function'?next(f.state[i]):next;}];}
        export function useEffect(effect,deps){const i=f.effectCursor++,old=f.deps[i];if(!old||deps.some((value,j)=>!Object.is(value,old[j]))){f.deps[i]=deps;f.pending.push([i,effect]);}}
        export default {createElement:(type,props,...children)=>({type,props,children})};
      `:path==='framer-motion'?'export const motion={div:"div"};export const AnimatePresence="presence";':
      path==='lucide-react'?'export const ArrowLeft=0,Heart=0,Bookmark=0,Share2=0,Eye=0,Clock=0,MessageSquare=0,Send=0,CornerDownRight=0,Check=0,Sparkles=0,AlertCircle=0,ShoppingBag=0;':
      path.endsWith('StoreProvider')?'export const useStore=()=>({products:[]});':
      path.endsWith('LanguageProvider')?'export const useLanguage=()=>({t:vi=>vi,tBilingual:vi=>vi,language:"vi"});export const BilingualText="text";':
      path.endsWith('aiTranslationService')?'export const getLuxuryArticleTranslation=()=>null;':
      path.endsWith('MarkdownContent')?'export default "markdown";':`
        const f=globalThis.articleFixture;
        export const getArticleDetail=(slug,options)=>{f.calls.push({slug,options});return Promise.resolve(f.response);};
        export const toggleArticleLike=()=>{},toggleArticleBookmark=()=>{},addArticleComment=()=>{},editArticleComment=()=>{},reportArticleComment=()=>{};
      `}));
  }}],
});
const {default:Detail}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const previousWindow=globalThis.window;
globalThis.window={location:{hash:''}};
async function render(props){
  fixture.stateCursor=fixture.effectCursor=0;
  const tree=Detail(props);
  for(const [index,effect] of fixture.pending.splice(0)){fixture.cleanups[index]?.();fixture.cleanups[index]=effect();}
  await Promise.resolve();
  return tree;
}
function nodes(tree){return tree&&typeof tree==='object'?[tree,...(tree.children||[]).flat(Infinity).flatMap(nodes)]:[];}
try{
  fixture.response={success:true,article:{id:'published',slug:'selected-post',title:'The selected published post',content:'Actual selected content',category:'Hướng dẫn',allow_comments:false},comments:[]};
  const props={slug:'selected-post',currentUser:{id:'reader',name:'Alice'}};
  await render(props);
  const loaded=await render({...props,currentUser:{id:'reader',name:'Updated name'}});
  assert.equal(fixture.calls.length,1,'A fresh object for the same logged-in reader must not reload the article');
  assert.ok(JSON.stringify(loaded).includes('Actual selected content'),'The selected content stays visible through parent rerenders');
  await render({...props,currentUser:{id:'another-reader'}});
  assert.equal(fixture.calls.length,2,'A changed reader refreshes personal reactions');
  await render({...props,slug:'another-post'});
  assert.equal(fixture.calls.length,3,'A changed slug loads the requested post');
  assert.ok(fixture.calls[1].options.signal.aborted,'Leaving an article aborts the obsolete request');
  fixture.response={success:false,message:'Bài viết không khả dụng.'};
  const missingProps={slug:'missing-post',currentUser:null};
  await render(missingProps);
  const missing=await render(missingProps),missingText=JSON.stringify(missing);
  assert.ok(missingText.includes('Bài viết không khả dụng.')&&!missingText.includes('Actual selected content'),'A missing post shows its real error without substituting unrelated content');
  const retry=nodes(missing).find(node=>node.type==='button'&&node.children.includes('Thử lại'));
  assert.ok(retry,'An unavailable post offers retry alongside back navigation');
  fixture.response={success:true,article:{id:'recovered',title:'Recovered selected post',content:'Recovered content',category:'Hướng dẫn'},comments:[]};
  retry.props.onClick();await render(missingProps);
  assert.equal(fixture.calls.length,5,'Retry makes one new request for the same slug');
  assert.ok(JSON.stringify(await render(missingProps)).includes('Recovered content'),'Retry renders the actual recovered post');
  await render({slug:'',currentUser:null});
  assert.ok(JSON.stringify(await render({slug:'',currentUser:null})).includes('Không có đường dẫn bài viết.'),'An absent slug does not leave the reader loading forever');
  console.log('PASS article reading: stable reader rerenders, changed reader/slug, cancellation, honest errors, retry and missing slug.');
} finally {
  fixture.cleanups.forEach(cleanup=>cleanup?.());
  if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;
  delete globalThis.articleFixture;
}
