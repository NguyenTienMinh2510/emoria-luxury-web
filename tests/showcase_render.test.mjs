import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Exercise the real component with decoded images, pointer input and screen ticks.
const fixture = { effects: [], writes: [], nextState: 0 };
globalThis.showcaseFixture = fixture;
const { outputFiles } = await build({
  entryPoints: ['src/components/ProductExplodedShowcase.jsx'], bundle: true,
  write: false, platform: 'node', format: 'esm', logLevel: 'silent',
  plugins: [{ name: 'controlled-ui', setup(builder) {
    builder.onResolve({ filter: /^(react|framer-motion|lucide-react)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'react' ? `
      const f = globalThis.showcaseFixture;
      export const useRef = value => ({current:value});
      export const useState = value => {const index=f.nextState++;return [value,next=>f.writes.push([index,next])];};
      export const useEffect = effect => f.effects.push(effect);
      export const useCallback = fn => fn;
      export default {createElement(type,props,...children){if(props?.ref)props.ref.current=f.elements[type];return {type,props,children};}};
    ` : path === 'framer-motion' ? 'export const motion={div:"div",button:"button"};export const AnimatePresence="presence";' :
      'export const Sparkles=0,ShieldCheck=0,Cpu=0,Layers=0,Disc=0,ChevronDown=0,Smartphone=0,FastForward=0,Lock=0,Unlock=0,X=0;' }));
  } }],
});
const { default: Showcase } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const listeners = new Map(), documentListeners = new Map(), raf = new Map();
let nextRaf = 1, layoutReads = 0, rect = { width: 800, height: 500 }, resized, now = 0;
const draws = [];
const canvas = { width: 300, height: 150, getBoundingClientRect: () => {layoutReads++;return rect;},
  getContext: () => ({ fillRect() {}, drawImage: (image,...geometry) => draws.push({url:image.url,geometry}) }) };
fixture.elements = { section: {offsetTop:0,offsetHeight:900}, canvas };
class ImageFixture {
  static created = [];
  constructor() { ImageFixture.created.push(this); }
  set src(url) { this.url=url; }
  decode() { return Promise.resolve(); }
  async finish() {this.naturalWidth=this.width=960;this.height=540;await this.onload();}
  removeAttribute() {}
}
Object.assign(globalThis, {
  Image: ImageFixture,
  window: { innerWidth: 1280, devicePixelRatio: 2, scrollY: 0, matchMedia: () => ({matches:false}),
    scrollTo() { listeners.get('scroll')?.(); },
    addEventListener: (name,fn) => listeners.set(name,fn), removeEventListener: name => listeners.delete(name) },
  document: { hidden:false, addEventListener:(name,fn)=>documentListeners.set(name,fn),removeEventListener:name=>documentListeners.delete(name) },
  ResizeObserver: class {constructor(fn){resized=fn;}observe(){}disconnect(){}},
  requestAnimationFrame: fn => {const id=nextRaf++;raf.set(id,fn);return id;},
  cancelAnimationFrame: id => raf.delete(id),
});
const flush = () => {now+=1000/60;const callbacks=[...raf.values()];raf.clear();callbacks.forEach(fn=>fn(now));};
const runToEnd = () => {let ticks=0;for(;ticks<650&&raf.size;ticks++)flush();assert.equal(raf.size,0,'Playback stops at its endpoint');return ticks;};
const find = (node,predicate) => {
  if (!node || typeof node!=='object') return;
  if (predicate(node)) return node;
  for(const child of (Array.isArray(node)?node:node.children||[])) {const match=find(child,predicate);if(match)return match;}
};
const frameWrites = () => fixture.writes.filter(([index])=>index===2);
const event = (pointerType='mouse',extra={}) => ({pointerType,isPrimary:true,button:0,clientX:200,clientY:200,
  currentTarget:{getBoundingClientRect:()=>({left:100,right:300,top:100,bottom:400})},...extra});
try {
  const tree=Showcase({});
  const mobileCard=find(tree,node=>node.props?.['data-showcase-layers']);
  assert.ok(mobileCard.props.className.includes('h-[188px]')&&mobileCard.props.className.includes('shrink-0'),'Mobile reserves fixed card height throughout playback');
  assert.ok(!JSON.stringify(mobileCard).includes('presence'),'The mobile card has no exit/enter fade or empty layout gap');
  const hotspot=find(tree,node=>node.type==='button'&&node.props?.onPointerEnter).props;
  const cleanups=fixture.effects.map(effect=>effect()).filter(fn=>typeof fn==='function');
  assert.equal(listeners.has('wheel'),false,'Wheel events never control frames or block native scrolling');
  assert.equal(listeners.has('touchmove'),false,'Native mobile scrolling remains enabled');
  assert.equal(ImageFixture.created.length,3,'Full preload starts immediately, with bounded concurrency');
  hotspot.onPointerEnter(event());flush();
  assert.equal(draws.length,0,'Undecoded frames are never drawn');
  await ImageFixture.created[0].finish();flush();
  assert.equal(draws.length,1,'The original closed image appears while remaining frames preload');
  assert.ok(!fixture.writes.some(([index,value])=>index===1&&value),'Playback stays unready until the entire sequence settles');
  for(let i=1;i<ImageFixture.created.length;i++)await ImageFixture.created[i].finish();
  assert.equal(ImageFixture.created.length,300,'All original frames are prepared without further input');
  assert.ok(fixture.writes.some(([index,value])=>index===1&&value));
  const beforeWrites=frameWrites().length;
  const openingTicks=runToEnd();
  assert.ok(openingTicks<=252,'The full sequence plays in about 4.2 seconds at 60Hz (20% faster rate)');
  assert.ok(draws.at(-1).url.includes('frame-299.webp'));
  assert.ok(frameWrites().length-beforeWrites<=6,'Layer labels update at milestones instead of each animation frame');
  assert.equal(layoutReads,1,'Playback never measures layout');
  assert.equal(draws.at(-1).geometry[0],(1600-1600*1.28)/2,'The original contain scale and center are retained');
  hotspot.onPointerLeave(event());runToEnd();
  assert.ok(draws.at(-1).url.includes('frame-000.webp'),'Leaving the image plays back to the closed frame');
  hotspot.onPointerEnter(event('touch'));flush();
  assert.equal(raf.size,0,'Touch hover alone does not open the image');
  hotspot.onPointerDown(event('touch'));
  for(let i=0;i<80;i++){hotspot.onPointerMove(event('touch'));flush();}
  const expandedDraws=draws.length;
  assert.ok(expandedDraws>1,'Repeated finger movement does not starve playback');
  hotspot.onPointerUp(event('touch',{isPrimary:false}));flush();
  assert.equal(raf.size,2,'A secondary finger cannot interrupt primary playback');
  hotspot.onPointerUp(event('touch'));runToEnd();
  assert.ok(draws.length>expandedDraws&&draws.at(-1).url.includes('frame-000.webp'),'Finger release reverses from the current frame');
  hotspot.onPointerDown(event('touch'));for(let i=0;i<20;i++)flush();
  hotspot.onPointerMove(event('touch',{clientY:500}));runToEnd();
  assert.ok(draws.at(-1).url.includes('frame-000.webp'),'Moving the finger outside the activation area collapses');
  for(const stop of [()=>listeners.get('scroll')(),()=>listeners.get('blur')(),()=>hotspot.onPointerCancel(event()),()=>hotspot.onBlur(),()=>hotspot.onKeyDown({key:'Escape'})]) {
    hotspot.onFocus();for(let i=0;i<30;i++)flush();stop();runToEnd();
    assert.ok(draws.at(-1).url.includes('frame-000.webp'),'Scroll, lost focus, cancellation and Escape collapse');
  }
  hotspot.onClick({detail:0});runToEnd();
  assert.ok(draws.at(-1).url.includes('frame-299.webp'),'Assistive technology can activate without pointer input');
  hotspot.onKeyDown({key:'Escape'});runToEnd();
  hotspot.onKeyDown({key:'Enter',preventDefault(){}});runToEnd();
  assert.ok(draws.at(-1).url.includes('frame-299.webp'),'Enter replays after Escape');
  rect={width:400,height:350};resized();flush();
  assert.equal(canvas.width,800);assert.equal(canvas.height,700);
  hotspot.onFocus();flush();cleanups.forEach(fn=>fn());
  assert.equal(raf.size,0);assert.equal(listeners.size,0);assert.equal(documentListeners.size,0);
  const preparedImages=ImageFixture.created.length;
  fixture.effects=[];fixture.writes=[];fixture.nextState=0;
  Showcase({});
  const cachedCleanups=fixture.effects.map(effect=>effect()).filter(fn=>typeof fn==='function');flush();
  assert.equal(ImageFixture.created.length,preparedImages,'Home remount reuses the decoded sequence without new downloads');
  assert.ok(fixture.writes.some(([index,value])=>index===1&&value),'Cached-ready home initializes readiness immediately');
  cachedCleanups.forEach(fn=>fn());
  fixture.effects=[];fixture.writes=[];fixture.nextState=0;ImageFixture.created=[];
  window.innerWidth=390;window.matchMedia=()=>({matches:true});
  const {default:MobileShowcase}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}#mobile`);
  const mobileTree=MobileShowcase({});
  const mobileHotspot=find(mobileTree,node=>node.type==='button'&&node.props?.onPointerEnter).props;
  const mobileCleanups=fixture.effects.map(effect=>effect()).filter(fn=>typeof fn==='function');
  assert.ok(ImageFixture.created.every(image=>image.url.includes('-640.webp')),'Phones prepare the lighter full sequence');
  for(let i=0;i<ImageFixture.created.length;i++)await ImageFixture.created[i].finish();flush();
  mobileHotspot.onFocus();flush();
  assert.ok(draws.at(-1).url.includes('frame-299-640.webp'),'Reduced motion shows the endpoint immediately');
  mobileHotspot.onBlur();flush();assert.ok(draws.at(-1).url.includes('frame-000-640.webp'));
  mobileCleanups.forEach(fn=>fn());
  fixture.effects=[];fixture.writes=[];fixture.nextState=0;ImageFixture.created=[];
  const {default:MissingShowcase}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}#missing`);
  const missingTree=MissingShowcase({});
  const missingHotspot=find(missingTree,node=>node.type==='button'&&node.props?.onPointerEnter).props;
  const missingCleanups=fixture.effects.map(effect=>effect()).filter(fn=>typeof fn==='function');
  missingHotspot.onFocus();flush();
  const beforeMissing=draws.length;
  for(let i=0;i<ImageFixture.created.length;i++){ImageFixture.created[i].onerror();ImageFixture.created[i].onerror();}
  flush();
  assert.equal(ImageFixture.created.length,300,'Terminal failures still finish the eager queue');
  assert.equal(draws.length,beforeMissing);
  assert.ok(!fixture.writes.some(([index,value])=>index===1&&value),'Missing images never enable playback');
  missingCleanups.forEach(fn=>fn());
  console.log('PASS showcase: 300 eagerly decoded frames, original framing, pointer/touch playback and reversal, native scroll, milestone labels, reduced motion, image failures and cleanup.');
} finally {
  for(const name of ['showcaseFixture','Image','window','document','ResizeObserver','requestAnimationFrame','cancelAnimationFrame']) delete globalThis[name];
}
