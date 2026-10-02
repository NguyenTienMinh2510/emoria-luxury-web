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
const listeners = new Map(), listenerOptions = new Map(), documentListeners = new Map(), raf = new Map();
let nextRaf = 1, layoutReads = 0, rect = { width: 800, height: 500 }, resized, now = 0;
let hotspotRect = { left:100,right:300,top:100,bottom:400 };
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
    addEventListener: (name,fn,options) => {listeners.set(name,fn);listenerOptions.set(name,options);},
    removeEventListener: name => {listeners.delete(name);listenerOptions.delete(name);} },
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
const lastFrame = () => Number(draws.at(-1).url.match(/frame-(\d+)/)[1]);
const hotspotElement = {getBoundingClientRect:()=>hotspotRect};
const event = (pointerType='mouse',extra={}) => ({pointerType,isPrimary:true,button:0,clientX:200,clientY:200,
  currentTarget:hotspotElement,...extra});
const touch = (identifier=7,extra={}) => ({identifier,clientX:200,clientY:200,...extra});
const touchEvent = (touches,changedTouches=touches) => ({touches,changedTouches,currentTarget:hotspotElement});
const focusEvent = (visible=true) => ({currentTarget:{matches:selector=>{assert.equal(selector,':focus-visible');return visible;}}});
try {
  const tree=Showcase({});
  assert.equal(find(tree,node=>node.props?.['data-showcase-layers']),undefined,'The animation has no overlaid layer cards');
  assert.equal(find(tree,node=>node.type==='progress'||node.type==='h4'||node.props?.role==='status'),undefined,'The image stage has no loading percentages, status messages or layer guides');
  const hotspot=find(tree,node=>node.type==='button'&&node.props?.onPointerEnter).props;
  const cleanups=fixture.effects.map(effect=>effect()).filter(fn=>typeof fn==='function');
  assert.equal(listeners.has('wheel'),false,'Wheel events never control frames or block native scrolling');
  for(const name of ['scroll','touchmove','touchend','touchcancel'])
    assert.equal(listenerOptions.get(name)?.passive,true,`${name} never blocks native mobile scrolling`);
  assert.equal(hotspot.style.touchAction,'pan-y','The image permits native vertical scrolling');
  assert.equal(ImageFixture.created.length,3,'Full preload starts immediately, with bounded concurrency');
  hotspot.onPointerEnter(event());flush();
  assert.equal(draws.length,0,'Undecoded frames are never drawn');
  await ImageFixture.created[0].finish();flush();
  assert.equal(draws.length,1,'The original closed image appears while remaining frames preload');
  for(let i=1;i<29;i++)await ImageFixture.created[i].finish();
  assert.ok(!fixture.writes.some(([index,value])=>index===0&&value),'A partial undecoded buffer cannot enable playback');
  await ImageFixture.created[29].finish();
  assert.ok(fixture.writes.some(([index,value])=>index===0&&value),'Playback starts from a safe buffer before all images finish');
  for(let i=0;i<150;i++)flush();
  const stalledFrame=lastFrame();
  assert.ok(stalledFrame<=58,'Playback stops at its decoded buffer rather than skipping unloaded images');
  for(let i=0;i<60;i++)flush();
  assert.equal(lastFrame(),stalledFrame,'A stalled network holds the visible image');
  assert.ok(raf.size>0,'The held pointer remains active while waiting for a frame');
  for(let i=30;i<ImageFixture.created.length;i++)await ImageFixture.created[i].finish();
  assert.equal(ImageFixture.created.length,150,'Only the evenly sampled sequence is downloaded');
  const beforeWrites=fixture.writes.length;
  const openingTicks=runToEnd();
  assert.ok(openingTicks<=252,'The remaining sequence retains the original 4.2-second playback rate');
  assert.ok(draws.at(-1).url.includes('frame-299.webp'));
  assert.ok(fixture.writes.length-beforeWrites<=1,'Animation ticks update only the canvas, with one endpoint state change');
  assert.equal(layoutReads,1,'Playback never measures layout');
  assert.equal(draws.at(-1).geometry[0],(1600-1600*1.28)/2,'The original contain scale and center are retained');
  hotspot.onPointerLeave(event());runToEnd();
  assert.ok(draws.at(-1).url.includes('frame-000.webp'),'Leaving the image plays back to the closed frame');
  hotspot.onPointerEnter(event('touch'));flush();
  assert.equal(raf.size,0,'Touch hover alone does not open the image');
  hotspot.onPointerDown(event('touch'));
  flush();assert.equal(raf.size,0,'Touch pointer events alone do not begin a finger session');
  const primary=touch(), secondary=touch(9,{clientY:500});
  hotspot.onTouchStart(touchEvent([primary]));
  for(let i=0;i<30;i++)flush();
  const beforeScrollFrame=lastFrame();
  for(let i=0;i<80;i++){
    listeners.get('touchmove')(touchEvent([primary]));
    hotspot.onPointerMove(event('touch'));
    hotspot.onPointerCancel(event('touch'));
    hotspot.onPointerLeave(event('touch'));
    hotspot.onPointerUp(event('touch'));
    hotspot.onBlur();listeners.get('scroll')();flush();
  }
  const expandedDraws=draws.length;
  assert.ok(lastFrame()>beforeScrollFrame,'Holding through repeated movement, native scroll and pointer cancellation advances playback');
  hotspot.onTouchStart(touchEvent([primary,secondary],[secondary]));
  listeners.get('touchmove')(touchEvent([secondary,primary]));
  listeners.get('touchend')(touchEvent([primary],[secondary]));
  listeners.get('touchcancel')(touchEvent([primary],[secondary]));
  runToEnd();assert.equal(lastFrame(),299,'Secondary touch starts, movement order, releases and cancellations cannot replace the held finger');
  listeners.get('touchend')(touchEvent([secondary],[primary]));runToEnd();
  assert.ok(draws.length>expandedDraws);assert.equal(lastFrame(),0,'Physical primary-finger release reverses even while a secondary finger remains');
  hotspot.onFocus(focusEvent(false));flush();
  assert.equal(lastFrame(),0);assert.equal(raf.size,0,'Touch-generated focus cannot reopen after release');
  hotspot.onTouchStart(touchEvent([primary]));runToEnd();
  listeners.get('touchmove')(touchEvent([touch(7,{clientY:500})]));runToEnd();
  assert.equal(lastFrame(),0,'Moving the held finger outside collapses');
  listeners.get('touchmove')(touchEvent([primary]));runToEnd();
  assert.equal(lastFrame(),299,'Moving the same held finger back inside resumes');
  hotspotRect={left:100,right:300,top:-400,bottom:-100};listeners.get('scroll')();runToEnd();
  assert.equal(lastFrame(),0,'Scrolling uses current image bounds rather than the touch-start rectangle');
  hotspotRect={left:100,right:300,top:100,bottom:400};listeners.get('scroll')();runToEnd();
  assert.equal(lastFrame(),299,'The held finger resumes when scrolling puts the image back under it');
  listeners.get('touchcancel')(touchEvent([secondary],[primary]));runToEnd();
  assert.equal(lastFrame(),0,'Actual primary touch cancellation closes the image');
  listeners.get('touchmove')(touchEvent([primary]));flush();
  assert.equal(raf.size,0,'A cancelled session cannot be revived by further touch movement');
  hotspot.onPointerDown(event('pen'));for(let i=0;i<30;i++){hotspot.onPointerMove(event('pen'));flush();}
  const penFrame=lastFrame();hotspot.onPointerUp(event('pen',{isPrimary:false}));flush();
  assert.ok(lastFrame()>=penFrame,'Secondary pen input cannot interrupt playback');
  hotspot.onPointerMove(event('pen',{clientY:500}));runToEnd();assert.equal(lastFrame(),0);
  hotspot.onPointerMove(event('pen'));runToEnd();assert.equal(lastFrame(),299,'Pen movement back into the image still opens');
  hotspot.onPointerUp(event('pen'));runToEnd();assert.equal(lastFrame(),0,'Pen release still closes');
  for(const stop of [()=>listeners.get('scroll')(),()=>listeners.get('blur')(),()=>hotspot.onPointerCancel(event()),()=>hotspot.onBlur(),()=>hotspot.onKeyDown({key:'Escape'})]) {
    hotspot.onFocus(focusEvent());for(let i=0;i<30;i++)flush();stop();runToEnd();
    assert.ok(draws.at(-1).url.includes('frame-000.webp'),'Scroll, lost focus, cancellation and Escape collapse');
  }
  for(const stop of [()=>listeners.get('blur')(),()=>{document.hidden=true;documentListeners.get('visibilitychange')();},()=>hotspot.onKeyDown({key:'Escape'})]) {
    hotspot.onTouchStart(touchEvent([primary]));for(let i=0;i<30;i++)flush();stop();runToEnd();
    assert.equal(lastFrame(),0,'Window blur, hidden tab and Escape close a held touch session');
    listeners.get('touchmove')(touchEvent([primary]));flush();assert.equal(raf.size,0,'Hard exits clear the held finger');
    document.hidden=false;
  }
  hotspot.onClick({detail:0});runToEnd();
  assert.ok(draws.at(-1).url.includes('frame-299.webp'),'Assistive technology can activate without pointer input');
  hotspot.onKeyDown({key:'Escape'});runToEnd();
  hotspot.onKeyDown({key:'Enter',preventDefault(){}});runToEnd();
  assert.ok(draws.at(-1).url.includes('frame-299.webp'),'Enter replays after Escape');
  rect={width:400,height:350};resized();flush();
  assert.equal(canvas.width,800);assert.equal(canvas.height,700);
  hotspot.onTouchStart(touchEvent([primary]));flush();cleanups.forEach(fn=>fn());
  assert.equal(raf.size,0);assert.equal(listeners.size,0);assert.equal(listenerOptions.size,0);assert.equal(documentListeners.size,0);
  const preparedImages=ImageFixture.created.length;
  fixture.effects=[];fixture.writes=[];fixture.nextState=0;
  Showcase({});
  const cachedCleanups=fixture.effects.map(effect=>effect()).filter(fn=>typeof fn==='function');flush();
  assert.equal(ImageFixture.created.length,preparedImages,'Home remount reuses the decoded sequence without new downloads');
  assert.ok(fixture.writes.some(([index,value])=>index===0&&value),'Cached-ready home initializes readiness immediately');
  cachedCleanups.forEach(fn=>fn());
  fixture.effects=[];fixture.writes=[];fixture.nextState=0;ImageFixture.created=[];
  window.innerWidth=390;window.matchMedia=()=>({matches:true});
  const {default:MobileShowcase}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}#mobile`);
  const mobileTree=MobileShowcase({});
  const mobileHotspot=find(mobileTree,node=>node.type==='button'&&node.props?.onPointerEnter).props;
  const mobileCleanups=fixture.effects.map(effect=>effect()).filter(fn=>typeof fn==='function');
  assert.ok(ImageFixture.created.every(image=>image.url.includes('-640.webp')),'Phones prepare the lighter full sequence');
  for(let i=0;i<ImageFixture.created.length;i++)await ImageFixture.created[i].finish();flush();
  mobileHotspot.onFocus(focusEvent());flush();
  assert.ok(draws.at(-1).url.includes('frame-299-640.webp'),'Reduced motion shows the endpoint immediately');
  mobileHotspot.onBlur();flush();assert.ok(draws.at(-1).url.includes('frame-000-640.webp'));
  mobileCleanups.forEach(fn=>fn());
  fixture.effects=[];fixture.writes=[];fixture.nextState=0;ImageFixture.created=[];
  const {default:MissingShowcase}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}#missing`);
  const missingTree=MissingShowcase({});
  const missingHotspot=find(missingTree,node=>node.type==='button'&&node.props?.onPointerEnter).props;
  const missingCleanups=fixture.effects.map(effect=>effect()).filter(fn=>typeof fn==='function');
  missingHotspot.onFocus(focusEvent());flush();
  const beforeMissing=draws.length;
  for(let i=0;i<ImageFixture.created.length;i++){ImageFixture.created[i].onerror();ImageFixture.created[i].onerror();}
  flush();
  assert.equal(ImageFixture.created.length,150,'Terminal failures still finish the bounded queue');
  assert.equal(draws.length,beforeMissing);
  assert.ok(!fixture.writes.some(([index,value])=>index===0&&value),'Missing images never enable playback');
  missingCleanups.forEach(fn=>fn());
  console.log('PASS showcase: 150 samples, clean image stage, buffered playback and stall/resume, original framing, held touch through native scroll, finger isolation, live bounds, keyboard, reduced motion and cleanup.');
} finally {
  for(const name of ['showcaseFixture','Image','window','document','ResizeObserver','requestAnimationFrame','cancelAnimationFrame']) delete globalThis[name];
}
