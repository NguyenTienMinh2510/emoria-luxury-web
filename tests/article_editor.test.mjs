import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://emoria.test/' });
const previousWindow = globalThis.window, previousDocument = globalThis.document;
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const require = createRequire(import.meta.url);
const fragment = html => JSDOM.fragment(html);
async function compile(file) {
  const { outputFiles } = await build({
    entryPoints: [file], bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{ name: 'shared-node-packages', setup(builder) {
      builder.onResolve({ filter: /^[^./]/ }, ({ path, kind }) => kind === 'entry-point' ? undefined : ({ path: pathToFileURL(require.resolve(path)).href, external: true }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
}

try {
  const { ARTICLE_RICH_PREFIX, ARTICLE_FONTS, ARTICLE_FONT_SIZES, articleToHtml, sanitizeArticleHtml, serializeArticleHtml, safeArticleUrl } =
    await import('../src/services/articleContent.js');
  assert.equal(ARTICLE_RICH_PREFIX, '<!--emoria-rich-text:v1-->');
  assert.ok(ARTICLE_FONTS.length >= 5);
  assert.deepEqual(Object.values(ARTICLE_FONT_SIZES), [10, 13, 16, 18, 24, 32, 48]);

  const legacy = '# Trang sức\n\nMột **kỷ vật** và [liên kết](https://example.com/story).\n\n- Bạc\n- Vàng\n\n![Món quà](/assets/gift.jpg)\nChú thích\n\n<h2 onclick="bad()">HTML cũ</h2>';
  const old = fragment(articleToHtml(legacy));
  assert.equal(old.querySelector('h1,h2,h3')?.textContent, 'Trang sức');
  assert.equal(old.querySelector('strong')?.textContent, 'kỷ vật');
  assert.equal(old.querySelector('a')?.getAttribute('href'), 'https://example.com/story');
  assert.equal(old.querySelectorAll('li').length, 2);
  assert.equal(old.querySelector('img')?.getAttribute('src'), '/assets/gift.jpg');
  assert.ok(old.textContent.includes('<h2 onclick="bad()">HTML cũ</h2>'), 'Existing raw HTML remains visible text');
  assert.equal(old.querySelectorAll('[onclick]').length, 0);
  assert.equal(fragment(articleToHtml('<p>Plain article</p>')).querySelector('p')?.textContent, '<p>Plain article</p>', 'HTML only activates with the exact rich prefix');
  assert.equal(fragment(articleToHtml(`text ${ARTICLE_RICH_PREFIX}<h2>Not rich</h2>`)).querySelector('h2'), null, 'A prefix inside plain content does not activate HTML');

  const rich = `<h2 style="text-align:center">Nghệ thuật chế tác</h2><p><strong>Đậm</strong> <em>Nghiêng</em> <u>Gạch chân</u> H<sub>2</sub>O x<sup>2</sup></p><ul><li>Một</li><li>Hai</li></ul><ol><li>Ba</li></ol><blockquote>Trích dẫn</blockquote><p><a href="https://example.com/story">Đọc thêm</a></p><img src="/assets/gift.jpg" alt="Món quà"><span style="font-family:Georgia,serif;font-size:24px;color:#aabbcc;background-color:#112233">Kiểu chữ</span><font face="Arial" size="5" color="#445566">Word</font><table><tbody><tr><td colspan="2">Bảng</td><td rowspan="2">Ô</td></tr></tbody></table>`;
  const safe = sanitizeArticleHtml(rich), formatted = fragment(safe);
  for (const tag of ['h2', 'strong', 'em', 'u', 'sub', 'sup', 'ul', 'ol', 'blockquote', 'a', 'img', 'table', 'td']) assert.ok(formatted.querySelector(tag), `Preserves ${tag}`);
  assert.equal(formatted.querySelector('h2').style.textAlign, 'center');
  const span = [...formatted.querySelectorAll('span')].find(node => node.textContent === 'Kiểu chữ');
  assert.ok(span.style.fontFamily.includes('Georgia'));
  assert.equal(span.style.fontSize, '24px');
  assert.equal(span.style.color, 'rgb(170, 187, 204)');
  const nativeFont = [...formatted.querySelectorAll('span')].find(node => node.textContent === 'Word');
  assert.ok(nativeFont.style.fontFamily.includes('Arial'), 'Native font commands become allowed CSS');
  assert.equal(nativeFont.style.fontSize, '24px');
  const chromeStyle = fragment(sanitizeArticleHtml('<span style="text-decoration-line:underline line-through;font-size:smaller">Chrome format</span>')).querySelector('span').style;
  assert.equal(chromeStyle.textDecoration, 'underline line-through', 'Chrome underline and strike commands survive saving');
  assert.equal(chromeStyle.fontSize, '13px', 'Chrome smaller font command becomes a bounded size');
  assert.equal(formatted.querySelector('td').getAttribute('colspan'), '2');
  const encoded = serializeArticleHtml(rich);
  assert.ok(encoded.startsWith(ARTICLE_RICH_PREFIX));
  assert.equal(articleToHtml(encoded), safe, 'Saved rich text roundtrips through the same sanitizer');
  assert.equal(sanitizeArticleHtml(safe), safe, 'Sanitizing saved markup is stable');
  for (const empty of ['', '<p><br></p>', '<div> \n </div>', '<script>alert(1)</script>']) assert.equal(serializeArticleHtml(empty), '', 'Empty or removed markup cannot save as a nonempty article');
  assert.ok(serializeArticleHtml('<img src="/assets/gift.jpg">'), 'A valid image is visible content');

  const malicious = `<h2 onclick="alert(1)">Tiêu đề</h2><script>alert(1)</script><svg onload="alert(1)"><a href="javascript:alert(1)">SVG</a></svg><form action="https://evil.test"><input name="token"></form><iframe srcdoc="<script>alert(1)</script>"></iframe><img src="data:image/svg+xml,evil" onerror="alert(1)"><a href="java&#x73;cript:alert(1)">Encoded</a><a href="vbscript:alert(1)">VB</a><a href="data:text/html,evil">Data</a><p style="color:#aabbcc;position:fixed;inset:0;background-image:url(javascript:alert(1));width:999999px">CSS</p><span style="font-family:evil; font-size:99999px; color:expression(alert(1)); text-align:invalid">Bad style</span>`;
  const cleaned = fragment(sanitizeArticleHtml(malicious));
  assert.equal(cleaned.querySelector('script,svg,form,input,iframe,object,embed'), null);
  for (const node of cleaned.querySelectorAll('*')) {
    for (const attr of node.attributes) assert.ok(!/^on/i.test(attr.name), 'No event handlers survive');
    for (const attr of ['href', 'src']) assert.ok(!/^(javascript|vbscript|data):/i.test(node.getAttribute(attr) || ''), 'No active URL schemes survive');
    assert.ok(!/(?:url\s*\(|expression\s*\(|position\s*:|inset\s*:|width\s*:|99999|font-family:\s*evil)/i.test(node.getAttribute('style') || ''), 'Only bounded article formatting survives inline CSS');
  }
  for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\nscript:alert(1)', 'vbscript:alert(1)', 'data:text/html,evil']) assert.ok(!safeArticleUrl(url), `Rejects ${url}`);
  assert.equal(safeArticleUrl('https://example.com/story'), 'https://example.com/story');
  assert.equal(safeArticleUrl('/assets/gift.jpg'), '/assets/gift.jpg');

  const editorSource = readFileSync('src/components/ArticleEditor.jsx', 'utf8');
  const restoreBody = editorSource.match(/const restoreSelection = \(\) => \{([\s\S]*?)\n  \};/)[1];
  const writing = document.createElement('div');
  writing.textContent = 'Alpha selected word Omega'; document.body.append(writing);
  const range = document.createRange(); range.setStart(writing.firstChild, 6); range.setEnd(writing.firstChild, 19);
  const editorRef = { current: writing }, selectionRef = { current: range.cloneRange() };
  window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
  writing.focus = () => {
    const collapsed = document.createRange(); collapsed.selectNodeContents(writing); collapsed.collapse(false);
    selectionRef.current = collapsed;
    window.getSelection().removeAllRanges(); window.getSelection().addRange(collapsed);
  };
  new Function('editorRef', 'selectionRef', 'window', 'document', restoreBody)(editorRef, selectionRef, window, document);
  assert.equal(window.getSelection().toString(), 'selected word', 'Returning from a formatting control restores the selected text even when focus updates the selection ref');
  writing.remove();

  const { default: MarkdownContent } = await compile('src/components/MarkdownContent.jsx');
  const publicHtml = renderToStaticMarkup(React.createElement(MarkdownContent, { content: encoded }));
  assert.ok(fragment(publicHtml).querySelector('h2,table'), 'Public article view renders saved rich formatting');
  const legacyHtml = renderToStaticMarkup(React.createElement(MarkdownContent, { content: '<img src=x onerror=bad()>' }));
  assert.ok(legacyHtml.includes('&lt;img'), 'Public rendering still escapes old raw HTML');
  const { default: ArticleEditor } = await compile('src/components/ArticleEditor.jsx');
  const editor = fragment(renderToStaticMarkup(React.createElement(ArticleEditor, { value: encoded, onChange() {} })));
  assert.ok(editor.querySelector('[role="toolbar"]'), 'Formatting tools belong to the embedded editor');
  assert.ok(editor.querySelector('[contenteditable="true"][role="textbox"]'), 'The writing surface has an accessible text editor role');
  assert.ok(editor.querySelector('select[aria-label*="chữ"],select[aria-label*="font" i]'), 'Font and size controls are labelled');
  assert.ok(editor.querySelectorAll('select').length >= 3, 'Font, size and paragraph/heading tools are present');
  assert.ok(editor.querySelector('button[aria-label*="đậm" i],button[aria-label*="bold" i]'), 'Bold is available as an accessible control');
  assert.ok(editor.querySelectorAll('button').length >= 10, 'Core inline formatting and insertion controls are available');
  assert.ok(editor.textContent.includes('Xem trước') || editor.textContent.includes('Preview'), 'An inline preview is available inside the form');
  console.log('PASS article editor: legacy content, safe rich formatting, native font/decoration commands, save/load roundtrip, XSS/CSS filtering, focus selection restoration and compact accessible toolbar.');
} finally {
  dom.window.close();
  if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
}
