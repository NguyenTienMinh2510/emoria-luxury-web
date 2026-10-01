import createDOMPurify from 'dompurify';

export const ARTICLE_RICH_PREFIX = '<!--emoria-rich-text:v1-->';
export const ARTICLE_FONTS = [
  'Montserrat, sans-serif', 'Playfair Display, serif', 'Georgia, serif',
  'Arial, sans-serif', 'Times New Roman, serif', 'Verdana, sans-serif', 'Courier New, monospace',
];
export const ARTICLE_FONT_SIZES = { 1: 10, 2: 13, 3: 16, 4: 18, 5: 24, 6: 32, 7: 48 };

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

export function safeArticleUrl(value) {
  const url = typeof value === 'string' ? value.trim() : '';
  return !/[\u0000-\u0020\u007f]/.test(url) && /^(https?:\/\/|\/(?![\/\\]))/i.test(url) ? url : null;
}

const normalizeFont = value => value.replace(/["']/g, '').toLowerCase().replace(/\s+/g, ' ').split(',').map(part => part.trim()).join(',');
const allowedFont = value => ARTICLE_FONTS.find(font => normalizeFont(font) === normalizeFont(value) || normalizeFont(font.split(',')[0]) === normalizeFont(value));
const fontKeywords = { 'xx-small': 10, 'x-small': 10, small: 13, smaller: 13, medium: 16, large: 18, 'x-large': 24, 'xx-large': 32, 'xxx-large': 48 };
const colorNames = new Set(['transparent', 'black', 'white', 'silver', 'gray', 'grey', 'red', 'green', 'blue', 'yellow', 'pink', 'orange', 'brown', 'purple', 'cyan', 'magenta', 'lime', 'gold', 'navy', 'teal', 'olive', 'fuchsia']);
function allowedColor(value) {
  if (colorNames.has(value.toLowerCase()) || /^#(?:[a-f\d]{3,4}|[a-f\d]{6}|[a-f\d]{8})$/i.test(value)) return value;
  const rgb = value.match(/^rgba?\(([\d\s.,/%]+)\)$/i);
  if (!rgb) return null;
  const parts = rgb[1].replace('/', ',').split(/[\s,]+/).filter(Boolean);
  return (parts.length === 3 || parts.length === 4) && parts.every((part, index) =>
    /^\d*\.?\d+%?$/.test(part) && Number.parseFloat(part) >= 0 &&
    Number.parseFloat(part) <= (part.endsWith('%') ? 100 : index === 3 ? 1 : 255)) ? value : null;
}

function cleanStyle(node) {
  const styles = [];
  for (const property of ['font-family', 'font-size', 'color', 'background-color', 'text-align', 'line-height', 'font-weight', 'font-style', 'text-decoration', 'vertical-align', 'margin-left']) {
    const value = (property === 'text-decoration'
      ? node.style.getPropertyValue('text-decoration-line') || node.style.getPropertyValue(property)
      : node.style.getPropertyValue(property)).trim();
    if (!value) continue;
    let safe;
    if (property === 'font-family') safe = allowedFont(value);
    else if (property === 'font-size') {
      const size = fontKeywords[value.toLowerCase()] || (/^\d+(?:\.\d+)?px$/i.test(value) && Number.parseFloat(value));
      if (size >= 10 && size <= 48) safe = `${size}px`;
    } else if (property === 'color' || property === 'background-color') safe = allowedColor(value);
    else if (property === 'text-align' && /^(left|center|right|justify)$/.test(value)) safe = value;
    else if (property === 'line-height' && [1, 1.5, 2].includes(Number(value))) safe = String(Number(value));
    else if (property === 'font-weight' && /^(normal|bold|[1-9]00)$/.test(value)) safe = value;
    else if (property === 'font-style' && /^(normal|italic|oblique)$/.test(value)) safe = value;
    else if (property === 'text-decoration' && /^(none|underline|line-through|underline line-through|line-through underline)$/.test(value)) safe = value;
    else if (property === 'vertical-align' && /^(baseline|sub|super)$/.test(value)) safe = value;
    else if (property === 'margin-left' && /^\d+(?:\.\d+)?px$/i.test(value) && Number.parseFloat(value) <= 160) safe = value;
    if (safe) styles.push(`${property}: ${safe}`);
  }
  return styles.join('; ');
}

let purifier, purifierWindow;
function getPurifier() {
  if (typeof window === 'undefined' || !window.document) return null;
  if (purifierWindow !== window) { purifierWindow = window; purifier = createDOMPurify(window); }
  return purifier;
}

export function sanitizeArticleHtml(html = '') {
  const sanitizer = getPurifier();
  if (!sanitizer) return escapeHtml(html);
  const fragment = sanitizer.sanitize(String(html), {
    ALLOWED_TAGS: ['p', 'br', 'div', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup', 'blockquote',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'img', 'figure', 'figcaption', 'hr',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'font'],
    ALLOWED_ATTR: ['style', 'href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'start', 'face', 'size', 'color', 'align'],
    ADD_URI_SAFE_ATTR: ['face', 'size', 'color', 'align', 'colspan', 'rowspan', 'start'],
    ALLOWED_URI_REGEXP: /^(https?:\/\/|\/(?![\/\\]))/i,
    ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false, RETURN_DOM_FRAGMENT: true,
    FORBID_TAGS: ['script', 'style', 'svg', 'math', 'iframe', 'object', 'embed', 'template', 'form', 'input', 'button'],
    FORBID_CONTENTS: ['script', 'style', 'svg', 'math', 'iframe', 'object', 'embed', 'template', 'noscript'],
  });
  for (let node of fragment.querySelectorAll('*')) {
    if (node.tagName === 'FONT') {
      const span = node.ownerDocument.createElement('span');
      span.style.cssText = cleanStyle(node);
      const font = allowedFont(node.getAttribute('face') || '');
      const size = ARTICLE_FONT_SIZES[node.getAttribute('size')];
      const color = allowedColor(node.getAttribute('color') || '');
      if (font) span.style.fontFamily = font;
      if (size) span.style.fontSize = `${size}px`;
      if (color) span.style.color = color;
      span.append(...node.childNodes); node.replaceWith(span); node = span;
    }
    const align = node.getAttribute('align');
    if (/^(left|center|right|justify)$/.test(align || '')) node.style.textAlign = align;
    const styles = cleanStyle(node);
    for (const attribute of [...node.attributes]) {
      const { name } = attribute;
      if (name === 'title' || (node.tagName === 'A' && name === 'href') ||
        (node.tagName === 'IMG' && ['src', 'alt'].includes(name))) continue;
      if ((['TD', 'TH'].includes(node.tagName) && ['colspan', 'rowspan'].includes(name)) || (node.tagName === 'OL' && name === 'start')) {
        const number = Number(attribute.value), maximum = name === 'start' ? 100000 : 100;
        if (Number.isInteger(number) && number >= 1 && number <= maximum) { node.setAttribute(name, String(number)); continue; }
      }
      node.removeAttribute(name);
    }
    if (styles) node.setAttribute('style', styles);
    if (node.tagName === 'A') {
      const url = safeArticleUrl(node.getAttribute('href'));
      if (url) { node.setAttribute('href', url); node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); }
      else node.removeAttribute('href');
    } else if (node.tagName === 'IMG') {
      const url = safeArticleUrl(node.getAttribute('src'));
      if (url) { node.setAttribute('src', url); node.setAttribute('loading', 'lazy'); }
      else node.remove();
    }
  }
  const container = window.document.createElement('div');
  container.append(fragment);
  return container.innerHTML;
}

function inlineMarkdown(text) {
  const tokens = /(\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]]+\]\([^)]+\))/g;
  let result = '', offset = 0;
  for (const match of text.matchAll(tokens)) {
    result += escapeHtml(text.slice(offset, match.index));
    const token = match[0], link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (token.startsWith('**')) result += `<strong>${escapeHtml(token.slice(2, -2))}</strong>`;
    else if (token.startsWith('*')) result += `<em>${escapeHtml(token.slice(1, -1))}</em>`;
    else if (link && safeArticleUrl(link[2])) result += `<a href="${escapeHtml(safeArticleUrl(link[2]))}" target="_blank" rel="noopener noreferrer">${escapeHtml(link[1])}</a>`;
    else result += escapeHtml(token);
    offset = match.index + token.length;
  }
  return (result + escapeHtml(text.slice(offset))).replace(/\n/g, '<br>');
}

export function articleToHtml(content = '') {
  const source = String(content ?? '');
  if (source.startsWith(ARTICLE_RICH_PREFIX)) return sanitizeArticleHtml(source.slice(ARTICLE_RICH_PREFIX.length));
  return source.split(/\n\s*\n/).map(block => {
    const image = block.match(/^!\[([^\]]*)\]\(([^)]+)\)(?:\n(.+))?$/);
    if (image && safeArticleUrl(image[2])) return `<figure><img src="${escapeHtml(safeArticleUrl(image[2]))}" alt="${escapeHtml(image[1])}" loading="lazy">${image[3] ? `<figcaption>${escapeHtml(image[3])}</figcaption>` : ''}</figure>`;
    const heading = block.match(/^(#{1,3}) (.+)$/);
    if (heading) return `<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`;
    if (block.startsWith('> ')) return `<blockquote>${inlineMarkdown(block.replace(/^> /gm, ''))}</blockquote>`;
    if (/^(- |\d+\. )/.test(block)) {
      const tag = /^\d+\. /.test(block) ? 'ol' : 'ul';
      return `<${tag}>${block.split('\n').map(line => `<li>${inlineMarkdown(line.replace(/^(- |\d+\. )/, ''))}</li>`).join('')}</${tag}>`;
    }
    return `<p>${inlineMarkdown(block)}</p>`;
  }).join('');
}

export function serializeArticleHtml(html = '') {
  const sanitized = sanitizeArticleHtml(html);
  if (typeof window === 'undefined' || !window.document) return sanitized ? ARTICLE_RICH_PREFIX + sanitized : '';
  const container = window.document.createElement('div');
  container.innerHTML = sanitized;
  const text = (container.textContent || '').replace(/[\u200b-\u200d\u2060\ufeff]/g, '').trim();
  return text || container.querySelector('img, table') ? ARTICLE_RICH_PREFIX + sanitized : '';
}
