import React from 'react';
import { articleToHtml } from '../services/articleContent.js';

export default function MarkdownContent({ content = '' }) {
  return <div className="article-content space-y-5 text-slate-300 leading-loose break-words"
    dangerouslySetInnerHTML={{ __html: articleToHtml(content) }} />;
}
