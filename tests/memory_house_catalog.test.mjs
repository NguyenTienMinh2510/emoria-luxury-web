import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { DECORATIONS } from '../src/services/house3d.js';

const dom = new JSDOM('<div id="root"></div>', { url: 'https://emoria.test' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const mediaListeners = new Set();
const media = {
  matches: false,
  addEventListener: (_, callback) => mediaListeners.add(callback),
  removeEventListener: (_, callback) => mediaListeners.delete(callback)
};
window.matchMedia = () => media;
const { createRoot } = await import('react-dom/client');
const { renderToStaticMarkup } = await import('react-dom/server');
const outfile = path.resolve('.local/ui-render/memory-house-catalog.mjs');
await fs.mkdir(path.dirname(outfile), { recursive: true });
await build({ entryPoints: ['src/components/MemoryHouse3D.jsx'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
const { default: MemoryHouse3D, DecorationLibrary, STYLE_PACKAGES } = await import(pathToFileURL(outfile));
for (const pkg of STYLE_PACKAGES) {
  assert.equal(pkg.isPendingAsset, undefined, 'Every displayed style package is usable');
  assert.ok(Object.values(pkg.slots).every(id => DECORATIONS.some(d => d.id === id)), 'Style packages use existing catalog models');
}
for (const id of ['cozy_home','sweet_melody','travel_memories','first_date']) assert.ok(STYLE_PACKAGES.some(pkg => pkg.id === id));
const rooms = [{ id: 'beginning', name: 'Phòng đầu tiên', memories: [], decorations: [] }];
const editor = renderToStaticMarkup(React.createElement(MemoryHouse3D, { rooms, activeRoomId: 'beginning' }));
const visitor = renderToStaticMarkup(React.createElement(MemoryHouse3D, { rooms, activeRoomId: 'beginning', readOnly: true }));
assert.ok(editor.includes('Phân trang đồ trang trí'), 'House editor renders the new picker');
assert.ok(!visitor.includes('Phân trang đồ trang trí'), 'Visitors cannot access the decoration picker');
const root = createRoot(document.getElementById('root'));
const picked = [];
const props = { view: '3d', placedCount: 3, onSelect: id => picked.push(id) };
const mount = async extra => act(async () => root.render(React.createElement(DecorationLibrary, { ...props, ...extra })));
const items = () => [...document.querySelectorAll('button[aria-pressed]')];
const page = () => document.querySelector('nav').textContent;
const next = () => document.querySelector('[aria-label="Trang đồ vật tiếp theo"]');
const previous = () => document.querySelector('[aria-label="Trang đồ vật trước"]');
const chooseCategory = async value => act(async () => {
  const select = document.querySelector('select');
  select.value = value;
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
});
const search = async value => act(async () => {
  const input = document.querySelector('input');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
});
const resize = async desktop => act(async () => {
  media.matches = desktop;
  for (const listener of mediaListeners) listener();
});

await mount();
assert.equal(document.querySelector('details').open, false, 'Catalog starts collapsed so the house stays visible');
assert.equal(document.querySelectorAll('option').length, 8);
assert.ok(items().length > 0 && items().length <= 6, 'Mobile renders at most six thumbnails');
assert.ok(previous().disabled);
const featuredNames = items().map(item => item.getAttribute('aria-label'));
while (!next().disabled) {
  await act(async () => next().click());
  assert.ok(items().length <= 6);
  featuredNames.push(...items().map(item => item.getAttribute('aria-label')));
}
assert.ok(!featuredNames.some(name => /Biển tên|Ngày của|Chim nhỏ|Nến/.test(name)), 'Secondary objects stay out of the recommendations');

await chooseCategory('all');
assert.ok(page().includes(`Trang 1/${Math.ceil(DECORATIONS.length / 6)}`), 'Changing category resets pagination');
assert.equal(items().length, 6);
const allNames = items().map(item => item.getAttribute('aria-label'));
while (!next().disabled) {
  await act(async () => next().click());
  assert.ok(items().length > 0 && items().length <= 6);
  allNames.push(...items().map(item => item.getAttribute('aria-label')));
}
assert.equal(new Set(allNames).size, DECORATIONS.length, 'Every curated asset is reachable once through All pages');
await chooseCategory('plants');
assert.ok(items().length >= 2 && items().length <= 6);
assert.ok(page().includes('Trang 1/'), 'Changing category never leaves an empty stale page');
await search('cay tinh yeu');
assert.equal(items().length, 1, 'Vietnamese search accepts unaccented text');
assert.ok(items()[0].textContent.includes('Cây tình yêu'));
await search('khong co mon nay');
assert.equal(items().length, 0);
assert.ok(document.body.textContent.includes('Không tìm thấy đồ vật'));
assert.ok(next().disabled && previous().disabled);

await search('');
await chooseCategory('all');
await act(async () => next().click());
await resize(true);
assert.equal(items().length, 12, 'Desktop renders at most twelve thumbnails');
assert.ok(page().includes('Trang 1/'), 'Resizing resets and clamps the page');
await resize(false);
assert.equal(items().length, 6);
await search('BIEN TEN');
assert.equal(items().length, 1);
assert.ok(items()[0].textContent.includes('Biển tên nhỏ'), 'Retired recommendations remain findable in All');
document.querySelector('details').open = true;
await act(async () => items()[0].click());
assert.deepEqual(picked, ['nameplate'], 'Picking keeps the existing asset ID');
assert.equal(document.querySelector('details').open, false, 'Picking collapses the picker before placement');
assert.equal(document.activeElement, document.querySelector('summary'), 'Keyboard focus returns to the visible summary');
await chooseCategory('recent');
assert.equal(items().length, 1);
assert.ok(items()[0].textContent.includes('Biển tên nhỏ'), 'Recent selection is ready to reuse');
await act(async () => items()[0].click());
assert.equal(items().length, 1, 'Selecting an item twice does not duplicate recent history');
assert.deepEqual(JSON.parse(window.localStorage.getItem('emoria-house-recent-decor')), ['nameplate']);
await mount({ disabled: true });
assert.ok(items().every(item => item.disabled), 'Loading and 2D restrictions from the parent remain enforced');
await act(async () => items()[0].click());
assert.deepEqual(picked, ['nameplate', 'nameplate']);
await act(async () => root.render(null));
await mount();
await chooseCategory('recent');
assert.equal(items().length, 1, 'Recent history survives leaving and returning to the studio');
await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Xóa lịch sử chọn').click());
assert.equal(items().length, 0);
assert.ok(document.body.textContent.includes('Chưa chọn món nào'));
assert.equal(window.localStorage.getItem('emoria-house-recent-decor'), null);
await act(async () => root.render(null));
window.localStorage.setItem('emoria-house-recent-decor', '{broken');
await mount();
await chooseCategory('recent');
assert.equal(items().length, 0, 'Malformed saved history does not break the picker');
await act(async () => root.render(null));
window.localStorage.setItem('emoria-house-recent-decor', JSON.stringify(['unknown', 'frame', 'frame', null]));
await mount();
await chooseCategory('recent');
assert.equal(items().length, 1, 'Stale asset IDs and duplicate history entries are ignored');
await act(async () => root.render(null));
window.localStorage.setItem('emoria-house-recent-decor', JSON.stringify(DECORATIONS.map(d => d.id)));
await mount();
await chooseCategory('recent');
await resize(true);
assert.equal(items().length, 12, 'Recent history stays bounded even with older oversized browser data');
await chooseCategory('all');
await search('may anh');
await act(async () => items()[0].click());
await chooseCategory('recent');
await search('');
assert.ok(items()[0].textContent.includes('Máy ảnh'), 'The last selected object moves to the front');
assert.equal(items().length, 12);
await act(async () => root.render(null));
const storageGet = window.Storage.prototype.getItem, storageSet = window.Storage.prototype.setItem;
window.Storage.prototype.getItem = () => { throw new Error('Storage blocked'); };
window.Storage.prototype.setItem = () => { throw new Error('Storage blocked'); };
await mount();
await search('khung anh');
await act(async () => items()[0].click());
await chooseCategory('recent');
await search('');
assert.equal(items().length, 1, 'Blocked browser storage still allows session history and selection');
window.Storage.prototype.getItem = storageGet;
window.Storage.prototype.setItem = storageSet;
await act(async () => root.unmount());
assert.equal(mediaListeners.size, 0, 'Media-query listener is removed on unmount');
dom.window.close();
console.log('PASS Decoration catalog: categories, 6/12 paging, search, placement, persisted deduplicated recent history, malformed history and cleanup.');
