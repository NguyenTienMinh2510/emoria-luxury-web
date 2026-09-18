import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Heart, Bookmark, Share2, Eye, Clock, 
  MessageSquare, Send, CornerDownRight, Check, Sparkles, AlertCircle, ShoppingBag
} from 'lucide-react';
import { 
  getArticleDetail, toggleArticleLike, toggleArticleBookmark, addArticleComment, editArticleComment, reportArticleComment 
} from '../services/articleService';
import { useStore } from '../components/StoreProvider';
import MarkdownContent from '../components/MarkdownContent';

export default function ArticleDetailView({ 
  slug, 
  onBack, 
  onSelectProduct, 
  onOpenAuth,
  currentUser,
  isAdmin = false
}) {
  const {products}=useStore();
  const [reactionBusy,setReactionBusy]=useState(false);
  const [article, setArticle] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [likeCount, setLikeCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Comment Form States
  const [commentText, setCommentText] = useState('');
  const [replyingToId, setReplyingToId] = useState(null); // parent_id cho 1 cấp
  const [replyText, setReplyText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  useEffect(() => {
    let active = true;
    const fetchDetail = async () => {
      setLoading(true);
      setArticle(null);setComments([]);
      try {
        const res = await getArticleDetail(slug);
        if (active && res.success && res.article) {
          setArticle(res.article);
          setComments(res.comments || []);
          setLikeCount(res.article.likes_count || 0);
          setIsLiked(Boolean(res.article.is_liked));
          setIsBookmarked(Boolean(res.article.is_bookmarked));
        }
      } catch (err) {
        console.error('Lỗi tải chi tiết bài viết:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    if (slug) fetchDetail();
    return () => { active = false; };
  }, [slug,currentUser]);

  useEffect(() => {
    if (!article || window.location.hash !== '#comments') return;
    document.getElementById('comments')?.scrollIntoView({block:'start'});
  }, [article]);

  const refreshComments=async()=>{const res=await getArticleDetail(slug);if(res.success)setComments(res.comments||[]);};
  const handleLike=async()=>{
    if(!currentUser){onOpenAuth?.();return;}if(!article||reactionBusy)return;setReactionBusy(true);
    const res=await toggleArticleLike(article.id,!isLiked);setReactionBusy(false);
    if(res.success){setIsLiked(res.is_liked);setLikeCount(res.likes_count);}else showToast(res.message);
  };
  const handleBookmark=async()=>{
    if(!currentUser){onOpenAuth?.();return;}if(!article||reactionBusy)return;setReactionBusy(true);
    const res=await toggleArticleBookmark(article.id,!isBookmarked);setReactionBusy(false);
    if(res.success){setIsBookmarked(res.is_bookmarked);showToast(res.is_bookmarked?'Đã lưu vào tài khoản.':'Đã bỏ lưu.');}else showToast(res.message);
  };
  const handleShare=async()=>{
    const url=new URL('/',window.location.origin);url.searchParams.set('article',slug);
    try{if(navigator.share){await navigator.share({title:article.title,url:url.href});showToast('Đã hoàn tất thao tác chia sẻ.');}else{await navigator.clipboard.writeText(url.href);showToast('Đã sao chép liên kết.');}}
    catch(error){if(error.name!=='AbortError')showToast('Không thể chia sẻ. Hãy sao chép đường dẫn trên thanh địa chỉ.');}
  };
  const editComment=async(comment,remove=false)=>{
    const content=remove?'':window.prompt('Sửa bình luận (sẽ chờ duyệt lại)',comment.content);if(content===null)return;
    if(remove&&!window.confirm('Xóa bình luận này?'))return;
    const res=await editArticleComment(comment.id,content,remove);if(res.success){await refreshComments();showToast(remove?'Đã xóa.':'Đã lưu và chuyển về chờ duyệt.');}else showToast(res.message);
  };
  const report=async id=>{if(!currentUser){onOpenAuth?.();return;}const reason=window.prompt('Lý do báo cáo');if(!reason)return;const res=await reportArticleComment(id,reason);showToast(res.success?'Đã gửi báo cáo đến quản trị.':res.message);};

  // Gửi bình luận gốc
  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!currentUser){onOpenAuth?.();return;}
    if (!commentText.trim() || !article.allow_comments) return;

    setSubmittingComment(true);
    const res = await addArticleComment({
      articleId: article.id,
      content: commentText.trim(),
      parentId: null,
    });
    setSubmittingComment(false);

    if (res.success) {
      setCommentText('');
      showToast(res.message);
      await refreshComments();
    } else {
      showToast(res.message || 'Không thể gửi bình luận.');
      if (onOpenAuth && res.message?.includes('đăng nhập')) {
        onOpenAuth();
      }
    }
  };

  // Gửi trả lời 1 cấp
  const handleSubmitReply = async (parentId) => {
    if (!replyText.trim()) return;

    setSubmittingComment(true);
    const res = await addArticleComment({
      articleId: article.id,
      content: replyText.trim(),
      parentId: parentId,
    });
    setSubmittingComment(false);

    if (res.success) {
      setReplyText('');
      setReplyingToId(null);
      showToast(res.message);
      await refreshComments();
    } else {
      showToast(res.message || 'Không thể gửi phản hồi.');
    }
  };

  // Lọc sản phẩm liên quan
  const relatedProducts = article?.related_product_ids?.length > 0
    ? products.filter(p => article.related_product_ids.includes(p.id))
    : [];

  // Phân tách bình luận gốc và phản hồi
  const rootComments = comments.filter(c => !c.parent_id);
  const getReplies = (commentId) => comments.filter(c => c.parent_id === commentId);

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-950 text-slate-100 pt-28 pb-20 px-4 max-w-4xl mx-auto animate-pulse">
        <div className="h-8 bg-white/10 rounded w-1/4 mb-6" />
        <div className="h-12 bg-white/10 rounded w-3/4 mb-4" />
        <div className="h-64 bg-white/10 rounded-2xl mb-8" />
        <div className="space-y-4">
          <div className="h-4 bg-white/10 rounded w-full" />
          <div className="h-4 bg-white/10 rounded w-5/6" />
          <div className="h-4 bg-white/10 rounded w-4/6" />
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-dark-950 text-slate-100 pt-28 pb-20 px-4 text-center">
        <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
        <h2 className="font-serif text-2xl text-white mb-2">Không tìm thấy bài viết</h2>
        <p className="text-slate-400 mb-6">Bài viết có thể đã bị gỡ bỏ hoặc tạm thời không khả dụng.</p>
        <button
          onClick={onBack}
          className="px-6 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-medium text-xs tracking-wider uppercase transition-colors"
        >
          Quay lại Tạp chí
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-950 text-slate-100 pt-24 pb-24 px-4 sm:px-6 lg:px-8">
      {/* Toast Alert */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 right-6 z-50 px-5 py-3 rounded-xl bg-dark-900/95 border border-white/20 text-slate-100 text-xs font-medium shadow-2xl backdrop-blur-xl flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-slate-300" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <article className="max-w-4xl mx-auto">
        
        {/* Navigation Bar Back */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-semibold tracking-wider text-slate-300 hover:text-white transition-all cursor-pointer shadow-inner"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại Tạp chí</span>
          </button>

          {/* Social Action Quick Bar */}
          <div className="flex items-center gap-2">
            <button
              disabled={reactionBusy}
              onClick={handleLike}
              title="Thích bài viết" aria-label="Thích bài viết" aria-pressed={isLiked}
              className={`min-h-11 min-w-11 p-2.5 rounded-full border transition-all cursor-pointer flex items-center gap-1.5 text-xs ${
                isLiked 
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 shadow-silver-glow' 
                  : 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Heart className={`w-4 h-4 ${isLiked ? 'fill-rose-400' : ''}`} />
              <span>{likeCount}</span>
            </button>

            <button
              disabled={reactionBusy}
              onClick={handleBookmark}
              title="Lưu bài viết" aria-label="Lưu bài viết" aria-pressed={isBookmarked}
              className={`min-h-11 min-w-11 p-2.5 rounded-full border transition-all cursor-pointer ${
                isBookmarked
                  ? 'bg-white/20 border-white/40 text-white shadow-silver-glow'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-white' : ''}`} />
            </button>

            <button
              onClick={handleShare}
              title="Chia sẻ liên kết" aria-label="Chia sẻ liên kết"
              className="min-h-11 min-w-11 p-2.5 rounded-full bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Article Meta Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/15 text-[11px] font-semibold tracking-widest text-slate-300 uppercase mb-4">
            {article.category}
          </div>

          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-medium tracking-wide text-white leading-tight mb-6">
            {article.title}
          </h1>

          <div className="flex flex-wrap items-center justify-between gap-4 py-4 border-y border-white/10 text-xs text-slate-400">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-white/20 to-white/5 border border-white/20 flex items-center justify-center font-serif text-white font-bold">
                E
              </div>
              <div>
                <p className="font-semibold text-slate-200">{article.author_name || 'EMORIA Atelier'}</p>
                <p className="text-[11px] text-slate-400">
                  {article.published_at ? new Date(article.published_at).toLocaleDateString('vi-VN', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Vừa xuất bản'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 font-mono">
              {(isAdmin || currentUser?.isAdmin) && (
                <span className="flex items-center gap-1" title="Lượt đọc bài viết (chỉ admin hiển thị)">
                  <Eye className="w-3.5 h-3.5" />
                  {article.view_count || 0} lượt đọc
                </span>
              )}
              <span className="flex items-center gap-1">
                <Heart className="w-3.5 h-3.5 text-rose-400" />
                {likeCount} lượt thích
              </span>
            </div>
          </div>
        </div>

        {/* Hero Cover Image */}
        {article.cover_image && (
          <div className="relative aspect-[16/9] rounded-2xl overflow-hidden mb-12 border border-white/15 shadow-2xl">
            <img
              src={article.cover_image}
              alt={article.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-dark-950/40 via-transparent to-transparent" />
          </div>
        )}

        {/* Excerpt Lead */}
        {article.excerpt && (
          <div className="p-6 rounded-2xl bg-white/[0.03] border-l-2 border-white/40 border-y border-r border-white/10 mb-10 text-base sm:text-lg text-slate-200 font-light italic leading-relaxed backdrop-blur-md">
            "{article.excerpt}"
          </div>
        )}

        {/* Main Content Body */}
        <div className="prose prose-invert max-w-none mb-16 space-y-6 text-sm sm:text-base text-slate-300 font-light leading-relaxed">
          <MarkdownContent content={article.content}/>
        </div>

        {/* Tags */}
        {article.tags?.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-12 pb-8 border-b border-white/10">
            <span className="text-xs text-slate-400 mr-2">Chủ đề:</span>
            {article.tags.map((tag, i) => (
              <span
                key={i}
                className="px-3 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-slate-300"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Related Products Showcase */}
        {relatedProducts.length > 0 && (
          <div className="mb-16 p-8 rounded-3xl bg-gradient-to-b from-white/[0.05] to-transparent border border-white/10 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-serif text-xl sm:text-2xl text-white font-normal">
                  Tuyệt Tác Xuất Hiện Trong Bài Viết
                </h3>
                <p className="text-xs text-slate-400 mt-1">Trải nghiệm chạm mở không gian kỷ niệm thực tế</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {relatedProducts.map((prod) => (
                <div
                  key={prod.id}
                  onClick={() => onSelectProduct && onSelectProduct(prod.id)}
                  className="group p-4 rounded-2xl bg-black/40 border border-white/10 hover:border-white/30 transition-all cursor-pointer flex items-center gap-4 hover:shadow-silver-glow"
                >
                  <img
                    src={prod.image}
                    alt={prod.name}
                    className="w-20 h-20 rounded-xl object-cover bg-white/5 border border-white/10 group-hover:scale-105 transition-transform"
                  />
                  <div className="flex-1">
                    <h4 className="font-serif text-sm font-semibold text-white group-hover:text-metallic transition-colors">
                      {prod.name}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-1">{prod.tagline}</p>
                    <p className="text-xs font-mono font-bold text-white mt-2">
                      {prod.price?.toLocaleString('vi-VN')} đ
                    </p>
                  </div>
                  <div className="p-2 rounded-full bg-white/10 group-hover:bg-white text-slate-300 group-hover:text-dark-950 transition-all">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* COMMENTS SECTION */}
        <section id="comments" className="scroll-mt-28 p-4 sm:p-8 rounded-3xl bg-black/50 border border-white/10 backdrop-blur-2xl shadow-2xl">
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-slate-300" />
              <h3 className="font-serif text-xl font-normal text-white">
                Ý Kiến & Cảm Nhận ({rootComments.length})
              </h3>
            </div>
            <span className="text-xs text-slate-400">Kiểm duyệt văn minh</span>
          </div>

          {/* New Root Comment Form */}
          <form onSubmit={handleSubmitComment} className="mb-10">
            <div className="relative">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={currentUser ? "Chia sẻ cảm nghĩ của quý khách về bài viết này..." : "Đăng nhập để tham gia bình luận và thảo luận cùng cộng đồng EMORIA..."}
                rows={3}
                maxLength={2000}
                disabled={!article.allow_comments}
                className="w-full p-4 rounded-2xl bg-white/5 border border-white/15 text-white placeholder-slate-400 text-xs sm:text-sm focus:outline-none focus:border-white/40 transition-all resize-none shadow-inner disabled:opacity-50"
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-[11px] text-slate-400">
                  {commentText.length}/2000 ký tự • Bình luận sẽ được duyệt trước khi hiển thị công khai.
                </span>

                {currentUser ? (
                  <button
                    type="submit"
                    disabled={submittingComment || !commentText.trim() || !article.allow_comments}
                    className="px-5 py-2 rounded-full bg-white text-dark-950 hover:bg-slate-200 disabled:opacity-40 text-xs font-semibold tracking-wider uppercase transition-all flex items-center gap-1.5 cursor-pointer shadow-silver-glow"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{submittingComment ? 'Đang gửi...' : 'Gửi Bình Luận'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onOpenAuth}
                    className="px-5 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold tracking-wider uppercase transition-all cursor-pointer"
                  >
                    Đăng Nhập Để Bình Luận
                  </button>
                )}
              </div>
            </div>
          </form>

          {/* Comment List */}
          <div className="space-y-6">
            {rootComments.length === 0 ? (
              <p className="text-center py-8 text-xs text-slate-400 italic">
                Chưa có bình luận nào cho bài viết này. Hãy là người đầu tiên chia sẻ cảm nghĩ!
              </p>
            ) : (
              rootComments.map((comm) => {
                const replies = getReplies(comm.id);
                const isReplying = replyingToId === comm.id;

                return (
                  <div key={comm.id} className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-4">
                    
                    <div className="flex gap-4 text-xs text-slate-400">{comm.status==='pending'&&<span className="text-amber-200">Chờ duyệt</span>}{comm.is_mine?<><button onClick={()=>editComment(comm)}>Sửa</button><button onClick={()=>editComment(comm,true)}>Xóa</button></>:<button onClick={()=>report(comm.id)}>Báo cáo</button>}</div>
                    {/* Root Comment Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center font-semibold text-xs text-white">
                          {comm.author_name?.charAt(0) || 'K'}
                        </div>
                        <div>
                          <span className="font-semibold text-xs text-slate-200 mr-2">{comm.author_name}</span>
                          <span className="text-[10px] text-slate-400">{comm.created_at}</span>
                        </div>
                      </div>

                      {/* Reply Button (Only 1 level nested) */}
                      {currentUser && article.allow_comments && comm.status==='approved' && (
                        <button
                          onClick={() => setReplyingToId(isReplying ? null : comm.id)}
                          className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <CornerDownRight className="w-3 h-3" />
                          <span>{isReplying ? 'Hủy' : 'Trả lời'}</span>
                        </button>
                      )}
                    </div>

                    {/* Content */}
                    <p className="text-xs sm:text-sm text-slate-300 pl-11 font-light leading-relaxed">
                      {comm.content}
                    </p>

                    {/* 1-Level Nested Replies */}
                    {replies.length > 0 && (
                      <div className="pl-11 pt-2 space-y-3 border-l-2 border-white/10 ml-4">
                        {replies.map((rep) => (
                          <div key={rep.id} className="p-3 rounded-xl bg-white/5 border border-white/5">
                            <div className="flex gap-3 text-xs text-slate-400 mb-2">{rep.status==='pending'&&<span className="text-amber-200">Chờ duyệt</span>}{rep.is_mine?<><button onClick={()=>editComment(rep)}>Sửa</button><button onClick={()=>editComment(rep,true)}>Xóa</button></>:<button onClick={()=>report(rep.id)}>Báo cáo</button>}</div>
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="font-semibold text-xs text-slate-200">{rep.author_name}</span>
                              {rep.author_name?.includes('Atelier') && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] bg-white/10 text-slate-200 border border-white/20">
                                  Atelier
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400">• {rep.created_at}</span>
                            </div>
                            <p className="text-xs text-slate-300 font-light leading-relaxed">
                              {rep.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reply Form (1-level only) */}
                    {isReplying && (
                      <div className="pl-11 pt-2">
                        <div className="p-3 rounded-xl bg-black/60 border border-white/15">
                          <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder={`Trả lời @${comm.author_name}...`}
                            rows={2}
                            maxLength={1000}
                            className="w-full p-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-slate-400 text-xs focus:outline-none focus:border-white/30 resize-none"
                          />
                          <div className="flex justify-end gap-2 mt-2">
                            <button
                              onClick={() => { setReplyingToId(null); setReplyText(''); }}
                              className="px-3 py-1 rounded-full text-xs text-slate-400 hover:text-white"
                            >
                              Đóng
                            </button>
                            <button
                              onClick={() => handleSubmitReply(comm.id)}
                              disabled={submittingComment || !replyText.trim()}
                              className="px-4 py-1 rounded-full bg-white text-dark-950 text-xs font-semibold hover:bg-slate-200 disabled:opacity-40 cursor-pointer"
                            >
                              Gửi
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                  </div>
                );
              })
            )}
          </div>
        </section>

      </article>
    </div>
  );
}
