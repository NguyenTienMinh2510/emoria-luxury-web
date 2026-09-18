import React, {useState} from 'react';

const statuses = {pending:'Chờ duyệt', approved:'Đã duyệt', hidden:'Đã ẩn'};

export default function CommentModeration({comments = [], onModerate = () => {}}) {
  const safeComments = Array.isArray(comments) ? comments : [];
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(null);
  const visible = safeComments.filter(c => filter === 'all' || c.status === filter);
  const moderate = async (id, status) => {
    setBusy(id);
    try { await onModerate(id, status); } finally { setBusy(null); }
  };
  return <section className="space-y-4">
    <div>
      <h2 className="font-serif text-2xl font-bold text-white">Kiểm Duyệt Bình Luận Cộng Đồng</h2>
      <p className="text-sm text-slate-400 mt-1">Bình luận đã duyệt hiển thị ở cuối bài viết tương ứng. Nếu bài đang mở ở tab khác, hãy tải lại trang.</p>
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Lọc bình luận">
      {Object.entries({all:'Tất cả', ...statuses}).map(([value, label]) => <button key={value}
        type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
        className={`px-3 py-2 rounded-lg text-sm border ${filter === value ? 'bg-white text-black border-white' : 'text-slate-300 border-white/20'}`}>
        {label} ({safeComments.filter(c => value === 'all' || c.status === value).length})
      </button>)}
    </div>
    {visible.length === 0 && <p className="p-8 text-center text-slate-400 border border-dashed border-white/20 rounded-xl">Không có bình luận trong mục này.</p>}
    {visible.map(comment => {
      const blockedParent = comment.parent_id && !safeComments.some(c => c.id === comment.parent_id && c.status === 'approved');
      return <article key={comment.id} className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <p className="text-slate-400"><strong className="text-white">{comment.author_name}</strong> · {new Date(comment.created_at).toLocaleString('vi-VN')}</p>
          <span className={`px-2 py-1 rounded border ${comment.status === 'approved' ? 'text-emerald-300 border-emerald-500/30' : comment.status === 'pending' ? 'text-amber-300 border-amber-500/30' : 'text-slate-400 border-white/20'}`}>{statuses[comment.status] || comment.status}</span>
        </div>
        <p className="text-sm text-slate-300 break-words">Bài viết: <strong className="text-white">{comment.article_title}</strong></p>
        <p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{comment.content}</p>
        {comment.article_status && comment.article_status !== 'published' && <p className="text-xs text-amber-300">Bài viết chưa được xuất bản nên bình luận chưa hiển thị công khai.</p>}
        {blockedParent && <p className="text-xs text-amber-300">Đây là phản hồi; bình luận gốc cần được duyệt trước khi phản hồi hiển thị.</p>}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {comment.article_slug && comment.article_status === 'published' && <a
            href={`/?article=${encodeURIComponent(comment.article_slug)}#comments`} target="_blank" rel="noopener noreferrer"
            className="px-3 py-2 rounded-lg border border-white/20 text-white">Mở bài viết ↗</a>}
          {['approved','hidden','deleted'].map(status => <button key={status} type="button"
            disabled={busy !== null || comment.status === status}
            onClick={() => moderate(comment.id, status)}
            className={`px-3 py-2 rounded-lg border border-white/20 disabled:opacity-40 disabled:cursor-not-allowed ${status === 'approved' ? 'text-emerald-300' : status === 'deleted' ? 'text-red-300' : 'text-slate-300'}`}>
            {status === 'approved' ? 'Duyệt' : status === 'hidden' ? 'Ẩn' : 'Xóa'}
          </button>)}
          {busy === comment.id && <span role="status" className="text-slate-400">Đang cập nhật…</span>}
        </div>
      </article>;
    })}
  </section>;
}
