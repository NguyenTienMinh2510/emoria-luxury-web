import React, { useEffect, useRef, useState } from 'react';
import { Undo2, Redo2, Bold, Italic, Underline, Strikethrough, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Link, Unlink, ImagePlus,
  Quote, IndentIncrease, IndentDecrease, Subscript, Superscript, Table2, RemoveFormatting, ChevronDown, Eye, Pencil } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageProvider';
import MarkdownContent from './MarkdownContent';
import { articleToHtml, serializeArticleHtml, sanitizeArticleHtml, safeArticleUrl,
  ARTICLE_FONTS, ARTICLE_FONT_SIZES } from '../services/articleContent.js';

export default function ArticleEditor({ value = '', onChange, disabled = false }) {
  const { t } = useLanguage();
  const editorRef = useRef(null), selectionRef = useRef(null), emittedRef = useRef();
  const [preview, setPreview] = useState(false), [more, setMore] = useState(false);
  const [format, setFormat] = useState({}), [message, setMessage] = useState('');
  const [insert, setInsert] = useState(null), [url, setUrl] = useState(''), [label, setLabel] = useState('');
  const [rows, setRows] = useState(2), [columns, setColumns] = useState(2);
  const selectClass = 'h-8 min-w-0 rounded-lg border border-white/15 bg-dark-950 px-2 text-xs text-slate-200';

  const rememberSelection = () => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editorRef.current?.contains(selection.anchorNode) ||
      !editorRef.current.contains(selection.focusNode)) return;
    selectionRef.current = selection.getRangeAt(0).cloneRange();
    const font = document.queryCommandValue('fontName').replace(/["']/g, '').toLowerCase();
    setFormat({
      font: ARTICLE_FONTS.find(name => name.toLowerCase() === font) || '',
      size: document.queryCommandValue('fontSize'),
      block: document.queryCommandValue('formatBlock').replace(/[<>]/g, '').toLowerCase() || 'p',
      bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'), strikeThrough: document.queryCommandState('strikeThrough'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
      justifyLeft: document.queryCommandState('justifyLeft'), justifyCenter: document.queryCommandState('justifyCenter'),
      justifyRight: document.queryCommandState('justifyRight'), justifyFull: document.queryCommandState('justifyFull'),
    });
  };

  useEffect(() => {
    if (value !== emittedRef.current && editorRef.current) {
      editorRef.current.innerHTML = value ? articleToHtml(value) : '';
      selectionRef.current = null;
      emittedRef.current = value;
    }
  }, [value]);
  useEffect(() => {
    document.addEventListener('selectionchange', rememberSelection);
    return () => document.removeEventListener('selectionchange', rememberSelection);
  }, []);

  const commit = () => {
    const content = serializeArticleHtml(editorRef.current.innerHTML);
    emittedRef.current = content;
    onChange(content);
  };
  const restoreSelection = () => {
    const editor = editorRef.current;
    const savedRange = selectionRef.current;
    editor.focus();
    const selection = window.getSelection();
    selection.removeAllRanges();
    if (savedRange && editor.contains(savedRange.commonAncestorContainer)) {
      selection.addRange(savedRange);
    } else {
      const range = document.createRange();
      range.selectNodeContents(editor); range.collapse(false); selection.addRange(range);
    }
  };
  const command = (name, argument) => {
    if (disabled || preview) return;
    restoreSelection();
    // ponytail: native commands preserve undo; use an editor engine if browser support changes.
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(name, false, argument);
    commit(); rememberSelection(); setMessage('');
  };
  const openInsert = kind => {
    setInsert(kind); setUrl(''); setLabel(selectionRef.current?.toString() || ''); setMessage('');
  };
  const insertContent = event => {
    event.preventDefault();
    if (insert === 'table') {
      if (![rows, columns].every(n => Number.isInteger(n) && n >= 1 && n <= 6)) return;
      const table = document.createElement('table');
      for (let r = 0; r < rows; r++) {
        const row = table.insertRow();
        for (let c = 0; c < columns; c++) row.insertCell().append(document.createElement('br'));
      }
      command('insertHTML', table.outerHTML + '<p><br></p>');
    } else {
      const href = safeArticleUrl(url);
      if (!href) { setMessage(t('Nhập liên kết https:// hoặc đường dẫn / hợp lệ.', 'Enter a valid https:// URL or / path.')); return; }
      const range = selectionRef.current;
      if (insert === 'link' && range && !range.collapsed && label === range.toString()) {
        command('createLink', href);
      } else {
        const node = document.createElement(insert === 'link' ? 'a' : 'img');
        if (insert === 'link') {
          node.href = href; node.textContent = label || href;
          node.target = '_blank'; node.rel = 'noopener noreferrer';
        } else { node.src = href; node.alt = label; }
        command('insertHTML', node.outerHTML);
      }
    }
    setInsert(null);
  };
  const paste = event => {
    event.preventDefault();
    rememberSelection();
    const html = event.clipboardData.getData('text/html');
    if (html) command('insertHTML', sanitizeArticleHtml(html));
    else command('insertText', event.clipboardData.getData('text/plain'));
  };
  const tools = [
    ['undo', Undo2, 'Hoàn tác', 'Undo'], ['redo', Redo2, 'Làm lại', 'Redo'],
    ['bold', Bold, 'Đậm', 'Bold'], ['italic', Italic, 'Nghiêng', 'Italic'], ['underline', Underline, 'Gạch chân', 'Underline'],
    ['insertUnorderedList', List, 'Danh sách dấu đầu dòng', 'Bullet list'], ['insertOrderedList', ListOrdered, 'Danh sách đánh số', 'Numbered list'],
    ['justifyLeft', AlignLeft, 'Căn trái', 'Align left'], ['justifyCenter', AlignCenter, 'Căn giữa', 'Align center'], ['justifyRight', AlignRight, 'Căn phải', 'Align right'],
  ];
  const extraTools = [
    ['strikeThrough', Strikethrough, 'Gạch ngang', 'Strikethrough'], ['justifyFull', AlignJustify, 'Căn đều', 'Justify'],
    ['indent', IndentIncrease, 'Tăng thụt lề', 'Increase indent'], ['outdent', IndentDecrease, 'Giảm thụt lề', 'Decrease indent'],
    ['subscript', Subscript, 'Chỉ số dưới', 'Subscript'], ['superscript', Superscript, 'Chỉ số trên', 'Superscript'],
    ['unlink', Unlink, 'Bỏ liên kết', 'Remove link'], ['removeFormat', RemoveFormatting, 'Xóa định dạng chữ', 'Clear text formatting'],
  ];
  const toolButton = (key, Icon, vi, en, action = () => command(key)) => (
    <button key={key} type="button" title={t(vi, en)} aria-label={t(vi, en)}
      aria-pressed={Object.hasOwn(format, key) ? Boolean(format[key]) : undefined}
      disabled={disabled || preview} onMouseDown={e => e.preventDefault()} onClick={action}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-white/15 disabled:opacity-40 ${format[key] ? 'bg-amber-300/20 text-amber-200' : 'text-slate-300'}`}>
      <Icon className="h-4 w-4" />
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label id="article-content-label" className="store-label !mb-0">{t('Nội dung bài viết', 'Article content')}</label>
        <button type="button" onClick={() => { setInsert(null); setPreview(!preview); }} className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white">
          {preview ? <Pencil className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {preview ? t('Tiếp tục viết', 'Continue editing') : t('Xem trước', 'Preview')}
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-white/15 bg-dark-950/70 focus-within:border-silver/40">
        <div role="toolbar" aria-label={t('Định dạng bài viết', 'Article formatting')} className="border-b border-white/10 bg-white/[0.03] p-2 space-y-1">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_70px] gap-1 sm:flex sm:flex-wrap sm:items-center">
            <select aria-label={t('Kiểu đoạn và heading', 'Paragraph and heading')} className={selectClass} value={format.block || 'p'}
              disabled={disabled || preview} onPointerDown={rememberSelection} onChange={e => command('formatBlock', e.target.value)}>
              <option value="p">{t('Đoạn văn', 'Paragraph')}</option>
              {[1, 2, 3, 4].map(n => <option key={n} value={`h${n}`}>Heading {n}</option>)}
            </select>
            <select aria-label={t('Font chữ', 'Font family')} className={`${selectClass} max-w-[150px]`} value={format.font || ''}
              disabled={disabled || preview} onPointerDown={rememberSelection} onChange={e => command('fontName', e.target.value)}>
              <option value="" disabled>{t('Font chữ', 'Font')}</option>
              {ARTICLE_FONTS.map(font => <option key={font} value={font}>{font.split(',')[0]}</option>)}
            </select>
            <select aria-label={t('Cỡ chữ', 'Font size')} className={selectClass} value={format.size || ''}
              disabled={disabled || preview} onPointerDown={rememberSelection} onChange={e => command('fontSize', e.target.value)}>
              <option value="" disabled>{t('Cỡ', 'Size')}</option>
              {Object.entries(ARTICLE_FONT_SIZES).map(([size, px]) => <option key={size} value={size}>{px} px</option>)}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-0.5">
            {tools.map(tool => toolButton(...tool))}
            {toolButton('link', Link, 'Chèn liên kết', 'Insert link', () => openInsert('link'))}
            {toolButton('image', ImagePlus, 'Chèn ảnh', 'Insert image', () => openInsert('image'))}
            <button type="button" aria-expanded={more} disabled={disabled || preview} onMouseDown={e => e.preventDefault()} onClick={() => setMore(!more)}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-slate-300 hover:bg-white/15 disabled:opacity-40">
              {t('Thêm', 'More')}<ChevronDown className={`h-3 w-3 ${more ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {more && <div className="flex flex-wrap items-center gap-0.5 border-t border-white/10 pt-1">
            {extraTools.map(tool => toolButton(...tool))}
            {toolButton('quote', Quote, 'Trích dẫn', 'Blockquote', () => command('formatBlock', 'blockquote'))}
            {toolButton('table', Table2, 'Chèn bảng', 'Insert table', () => openInsert('table'))}
            <label className="inline-flex items-center gap-1 px-2 text-xs text-slate-300">{t('Màu chữ', 'Text color')}
              <input type="color" aria-label={t('Màu chữ', 'Text color')} defaultValue="#e2e8f0" disabled={disabled || preview}
                className="h-6 w-7 bg-transparent cursor-pointer" onPointerDown={rememberSelection} onChange={e => command('foreColor', e.target.value)} />
            </label>
            <label className="inline-flex items-center gap-1 px-2 text-xs text-slate-300">{t('Tô nền', 'Highlight')}
              <input type="color" aria-label={t('Màu tô nền', 'Highlight color')} defaultValue="#4a3b13" disabled={disabled || preview}
                className="h-6 w-7 bg-transparent cursor-pointer" onPointerDown={rememberSelection} onChange={e => command('hiliteColor', e.target.value)} />
            </label>
          </div>}
        </div>
        {insert && <form onSubmit={insertContent} className="flex flex-wrap items-end gap-2 border-b border-white/10 bg-dark-900 p-3">
          {insert === 'table' ? <>
            <label className="text-xs text-slate-300">{t('Số hàng', 'Rows')}<input type="number" min="1" max="6" value={rows} onChange={e => setRows(Number(e.target.value))} className="store-input !w-20" /></label>
            <label className="text-xs text-slate-300">{t('Số cột', 'Columns')}<input type="number" min="1" max="6" value={columns} onChange={e => setColumns(Number(e.target.value))} className="store-input !w-20" /></label>
          </> : <>
            <label className="flex-1 min-w-[180px] text-xs text-slate-300">{insert === 'image' ? t('Đường dẫn ảnh', 'Image URL') : t('Đường dẫn liên kết', 'Link URL')}
              <input inputMode="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" required className="store-input" /></label>
            <label className="flex-1 min-w-[140px] text-xs text-slate-300">{insert === 'image' ? t('Mô tả ảnh', 'Image description') : t('Chữ hiển thị', 'Link text')}
              <input value={label} onChange={e => setLabel(e.target.value)} className="store-input" /></label>
          </>}
          <button type="submit" className="btn-luxury-tertiary">{t('Chèn', 'Insert')}</button>
          <button type="button" onClick={() => setInsert(null)} className="btn-luxury-tertiary">{t('Hủy', 'Cancel')}</button>
        </form>}
        <div hidden={preview}>
          <div ref={editorRef} role="textbox" aria-labelledby="article-content-label" aria-multiline="true" aria-disabled={disabled}
            contentEditable={!disabled} translate="no" suppressContentEditableWarning data-placeholder={t('Viết câu chuyện của bạn…', 'Write your story…')}
            onInput={commit} onPaste={paste} onDrop={e => { e.preventDefault(); setMessage(t('Dùng Chèn ảnh để thêm ảnh bằng đường dẫn.', 'Use Insert image to add an image URL.')); }}
            onFocus={() => { document.execCommand('defaultParagraphSeparator', false, 'p'); rememberSelection(); }}
            className="article-content article-editor min-h-[260px] max-h-[55vh] overflow-y-auto p-4 sm:p-5 text-base outline-none" />
        </div>
        {preview && <div className="min-h-[260px] max-h-[55vh] overflow-y-auto p-4 sm:p-5 text-base"><MarkdownContent content={value} /></div>}
      </div>
      <p className="text-[11px] text-slate-400">{t('Chọn chữ rồi dùng thanh công cụ để định dạng. Có thể dán nội dung từ Word.', 'Select text to format it. You can paste content from Word.')}</p>
      {message && <p role="status" className="text-xs text-amber-200">{message}</p>}
    </div>
  );
}
