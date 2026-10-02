import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';

const fixture = { effects: [], writes: [], state: 0, engines: [], observers: [], host: {} };
globalThis.housePreviewFixture = fixture;
globalThis.IntersectionObserver = class {
  constructor(callback) { this.callback = callback; fixture.observers.push(this); }
  observe(host) { assert.equal(host, fixture.host); }
  disconnect() { this.disconnected = true; }
};
const { outputFiles } = await build({
  entryPoints: ['src/components/MemoryHousePreview.jsx'], bundle: true, write: false,
  platform: 'node', format: 'esm', logLevel: 'silent',
  plugins: [{ name: 'preview-boundaries', setup(builder) {
    builder.onResolve({ filter: /^(react)$|LanguageProvider$|house3dRenderer\.js$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'react' ? `
      const f=globalThis.housePreviewFixture;
      export const useRef=value=>({current:value});
      export const useState=value=>{const index=f.state++;return [value,next=>f.writes.push([index,next])];};
      export const useEffect=effect=>f.effects.push(effect);
      export default {createElement(type,props,...children){if(props?.ref)props.ref.current=f.host;return {type,props,children};}};
    ` : path.endsWith('LanguageProvider') ? `export const useLanguage=()=>({t:vi=>vi});` : `
      export function createHouseRenderer(host,callbacks){
        const f=globalThis.housePreviewFixture;
        if(f.fail)throw Error('WebGL unavailable');
        const engine={callbacks,updates:[],overviews:[],disposed:0,
          update(value){this.updates.push(value);},overview(value){this.overviews.push(value);},
          captureWhenReady(){return new Promise(resolve=>{this.resolveCapture=resolve;});},
          dispose(){this.disposed++;}};
        f.engines.push(engine);return engine;
      }
    ` }));
  } }]
});
const { default: Preview } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const mount = house => {
  fixture.effects = []; fixture.writes = []; fixture.state = 0;
  const tree = Preview({ house });
  const cleanup = fixture.effects[0]();
  return { tree, cleanup, observer: fixture.observers.at(-1) };
};
const house = { title: 'Nhà của Minh', theme: 'rose_romance', rooms: [{ id: 'beginning', memories: [{ photo_url: 'private-room-photo' }], decorations: [{ item: 'cat' }] }] };
try {
  const first = mount(house);
  assert.equal(fixture.engines.length, 0, 'Below-fold house previews do not start WebGL');
  first.observer.callback([{ isIntersecting: false }]); await flush();
  assert.equal(fixture.engines.length, 0);
  first.observer.callback([{ isIntersecting: true }]); await flush();
  const engine = fixture.engines.at(-1);
  assert.deepEqual(engine.updates, [{ rooms: house.rooms, title: house.title, theme: house.theme }], 'Capture renders saved decorations and theme');
  assert.deepEqual(engine.overviews, [false]);
  assert.equal(engine.callbacks.isEditing(), false);
  const ready = engine.callbacks.onReady();
  assert.ok(!fixture.writes.some(([index, value]) => index === 1 && value === 'ready'), 'Preview waits for model/photo rendering');
  engine.resolveCapture('data:image/png;base64,actual-house'); await ready;
  assert.ok(fixture.writes.some(([index, value]) => index === 0 && value === 'data:image/png;base64,actual-house'));
  assert.equal(engine.disposed, 1, 'Static image releases the 3D renderer');
  first.cleanup(); assert.equal(engine.disposed, 1);

  const cancelled = mount(house);
  cancelled.observer.callback([{ isIntersecting: true }]); await flush();
  const old = fixture.engines.at(-1), capture = old.callbacks.onReady();
  cancelled.cleanup();
  const before = fixture.writes.length;
  old.resolveCapture('data:image/png;base64,old-house'); await capture;
  assert.equal(fixture.writes.length, before, 'Old tag captures never overwrite a new house or unmounted view');
  assert.equal(old.disposed, 1);

  fixture.fail = true;
  const unsupported = mount(house);
  unsupported.observer.callback([{ isIntersecting: true }]); await flush();
  assert.deepEqual(fixture.writes.at(-1), [1, 'fallback'], 'Unavailable WebGL keeps the explicit sample 3D image fallback');
  unsupported.cleanup();
  const source = fs.readFileSync('src/views/MemorySpaceView.jsx', 'utf8');
  const section = source.slice(source.indexOf('{/* D2. MEMORY HOUSE SHOWCASE'), source.indexOf('{/* E. Guestbook'));
  assert.ok(section.includes('<MemoryHousePreview'));
  assert.ok(!section.includes('photo_url') && !section.includes('roomMemories'), 'Review House shows the 3D house image rather than room-upload thumbnails');
  assert.ok(section.includes('!houseData.is_published_snapshot'), 'Guests retain the published-snapshot gate');
  console.log('PASS house preview: lazy model capture, saved house data, texture readiness, GPU disposal, tag cancellation, 3D fallback and published-only guest review.');
} finally {
  delete globalThis.housePreviewFixture;
  delete globalThis.IntersectionObserver;
}
