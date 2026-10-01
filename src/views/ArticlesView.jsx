import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Sparkles, BookOpen, Clock, Eye, Heart, ArrowRight, Tag, Share2, Bookmark } from 'lucide-react';
import { getPublishedArticles, getSavedArticles } from '../services/articleService';
import { useLanguage, BilingualText } from '../i18n/LanguageProvider';
import { getLuxuryArticleTranslation } from '../services/aiTranslationService';

const CATEGORIES = [
  { id: 'Tất cả', vi: 'Tất cả', en: 'All' },
  { id: 'Chế tác & Nghệ thuật', vi: 'Chế tác & Nghệ thuật', en: 'Art & Craft' },
  { id: 'Công nghệ & NFC', vi: 'Công nghệ & NFC', en: 'Tech & NFC' },
  { id: 'Phong cách sống', vi: 'Phong cách sống', en: 'Lifestyle' },
  { id: 'Hướng dẫn', vi: 'Hướng dẫn', en: 'Guides' }
];

const DEFAULT_ARTICLES = [
  {
    id: 'art-1',
    slug: 'nghe-thuat-che-tac-da-quy-emoria',
    title: 'Nghệ Thuật Chế Tác Đá Quý & Kim Hoàn EMORIA',
    excerpt: 'Hành trình kỳ công kết hợp giữa bí truyền đẽo gọt đá quý thiên nhiên và vi mạch công nghệ NFC trường tồn.',
    cover_image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=800&q=80',
    category: 'Chế tác & Nghệ thuật',
    author_name: 'EMORIA Master Artisan',
    published_at: '2026-03-15T00:00:00Z',
    likes_count: 128,
    view_count: 1420
  },
  {
    id: 'art-2',
    slug: 'bi-mat-cong-nghe-nfc-2026',
    title: 'Bí Mật Công Nghệ NFC Thế Hệ Mới Trong Trang Sức',
    excerpt: 'Giải mã giải pháp truyền dẫn sóng qua kim loại bạc S925 chuẩn IP68 mà không cần pin sạc.',
    cover_image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=800&q=80',
    category: 'Công nghệ & NFC',
    author_name: 'EMORIA Tech Lab',
    published_at: '2026-03-10T00:00:00Z',
    likes_count: 95,
    view_count: 980
  }
];

export default function ArticlesView({ onSelectArticle, onNavigateToShop, isAdmin = false }) {
  const { t, tBilingual, language } = useLanguage();
  const [page, setPage] = useState(0);
  const [savedOnly, setSavedOnly] = useState(false);
  const [error, setError] = useState('');
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('Tất cả');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const fetchArticles = async () => {
      setLoading(true);
      try {
        const res = savedOnly ? await getSavedArticles({signal:controller.signal}) : await getPublishedArticles({
          category: selectedCategory === 'Tất cả' ? null : selectedCategory,
          search: debouncedQuery,
          signal: controller.signal,
          limit: 12, offset: page * 12,
        });
        if (active) {
          setError(res.success ? '' : res.message);
          if (res.success && res.articles && res.articles.length > 0) {
            setArticles(res.articles);
            setTotalCount(res.total || res.articles.length);
          } else {
            // If DB is empty, provide default curated chronicle articles
            const filtered = DEFAULT_ARTICLES.filter(item => {
              const matchCat = selectedCategory === 'Tất cả' || item.category === selectedCategory;
              const matchSearch = !debouncedQuery || item.title.toLowerCase().includes(debouncedQuery.toLowerCase());
              return matchCat && matchSearch;
            });
            setArticles(filtered);
            setTotalCount(filtered.length);
          }
        }
      } catch (err) {
        console.error('Lỗi khi tải bài viết:', err);
        if (active) setArticles(DEFAULT_ARTICLES);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchArticles();
    return () => { active = false; controller.abort(); };
  }, [selectedCategory, debouncedQuery, page, savedOnly]);

  return (
    <div className="min-h-screen bg-dark-950 text-slate-100 pt-24 pb-20 px-4 sm:px-6 lg:px-8">
      {/* Background Ambience Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-radial from-slate-600/10 via-transparent to-transparent blur-3xl opacity-60" />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        
        <div className="flex flex-wrap items-center justify-end gap-4 mb-5 text-sm">
          <button onClick={() => { setSavedOnly(!savedOnly); setPage(0); }} className="store-button">
            {savedOnly ? t('Tất cả bài viết', 'All Articles') : t('Bài viết đã lưu', 'Saved Articles')}
          </button>
          {!savedOnly && (
            <>
              <button disabled={!page} onClick={() => setPage(p => p - 1)} className="px-3 py-1 bg-white/5 rounded border border-white/10 disabled:opacity-30">
                {t('Trước', 'Previous')}
              </button>
              <span className="text-xs text-slate-400 font-mono">
                {t('Trang {page}', 'Page {page}', { page: page + 1 })}
              </span>
              <button disabled={(page + 1) * 12 >= totalCount} onClick={() => setPage(p => p + 1)} className="px-3 py-1 bg-white/5 rounded border border-white/10 disabled:opacity-30">
                {t('Sau', 'Next')}
              </button>
            </>
          )}
        </div>

        {error && <p role="alert" className="text-red-300 mb-4">{error}</p>}

        {/* Header Section */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-semibold tracking-widest text-slate-300 uppercase mb-4 shadow-silver-glow">
            <Sparkles className="w-3.5 h-3.5 text-slate-300 animate-pulse" />
            <span>{tBilingual('Tạp Chí & Tinh Hoa Kỷ Niệm', 'Chronicles & Sentimental Heritage')}</span>
          </div>

          <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-normal tracking-wide text-metallic mb-6 notranslate" translate="no">
            EMORIA CHRONICLES
          </h1>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-light">
            <BilingualText
              vi="Nơi hội tụ những câu chuyện chế tác kim hoàn xa xỉ, giải mã công nghệ vi mạch NFC ẩn mình và cẩm nang lưu giữ ký ức trường tồn cùng thời gian."
              en="A sanctuary of fine jewelry savoir-faire, hidden NFC microchip wonders, and timeless guides to preserving eternal memories."
            />
          </p>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-12 p-4 rounded-2xl bg-black/40 border border-white/10 backdrop-blur-xl shadow-2xl">
          
          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-none">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => { setSelectedCategory(cat.id); setPage(0); }}
                className={`px-4 py-2 rounded-full text-xs font-medium tracking-wider uppercase transition-all duration-300 whitespace-nowrap cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-white text-dark-950 font-semibold shadow-silver-glow'
                    : 'bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 border border-white/5'
                }`}
              >
                {t(cat.vi, cat.en)}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-72">
            <input
              type="text"
              placeholder={t('Tìm kiếm bài viết, thẻ...', 'Search articles, tags...')}
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              className="w-full h-10 pl-10 pr-4 rounded-full text-xs bg-white/5 border border-white/15 text-white placeholder-slate-400 focus:outline-none focus:border-white/40 transition-all shadow-inner"
            />
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map((n) => (
              <div key={n} className="rounded-2xl bg-white/5 border border-white/10 p-4 animate-pulse h-96">
                <div className="h-48 bg-white/10 rounded-xl mb-4" />
                <div className="h-4 bg-white/10 rounded w-1/3 mb-2" />
                <div className="h-6 bg-white/10 rounded w-4/5 mb-3" />
                <div className="h-4 bg-white/10 rounded w-full mb-2" />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && articles.length === 0 && (
          <div className="text-center py-20 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
            <BookOpen className="w-12 h-12 text-slate-400 mx-auto mb-4 stroke-1" />
            <h3 className="font-serif text-xl text-white mb-2">{t('Chưa có bài viết nào', 'No articles found')}</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              {t('Không tìm thấy bài viết phù hợp với tiêu chí tìm kiếm của quý khách. Hãy thử chọn danh mục khác.', 'No articles matched your criteria. Please try another category or search phrase.')}
            </p>
          </div>
        )}

        {/* Articles Grid */}
        {!loading && articles.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {articles.map((article, index) => {
              const luxury = language === 'en' ? getLuxuryArticleTranslation(article.slug) : null;
              const displayTitle = luxury?.title || article.title;
              const displayExcerpt = luxury?.excerpt || article.excerpt;

              return (
                <motion.article
                  key={article.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.08 }}
                  onClick={() => onSelectArticle && onSelectArticle(article.slug)}
                  className="group relative rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.02] border border-white/10 hover:border-white/30 overflow-hidden cursor-pointer backdrop-blur-xl transition-all duration-300 hover:shadow-silver-glow flex flex-col justify-between"
                >
                  <div>
                    {/* Cover Image */}
                    <div className="relative aspect-[16/10] overflow-hidden">
                      <img
                        src={article.cover_image || 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=800&q=80'}
                        alt={displayTitle}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-dark-950 via-dark-950/30 to-transparent" />
                      
                      {/* Category Tag Badge */}
                      <div className="absolute top-3 left-3">
                        <span className="px-3 py-1 rounded-full text-[11px] font-semibold tracking-wider bg-black/60 border border-white/20 text-slate-200 backdrop-blur-md uppercase">
                          {t(article.category, article.category === 'Chế tác & Nghệ thuật' ? 'Art & Craft' : article.category === 'Công nghệ & NFC' ? 'Tech & NFC' : article.category)}
                        </span>
                      </div>
                    </div>

                    {/* Body Content */}
                    <div className="p-6">
                      <div className="flex items-center gap-4 text-xs text-slate-400 mb-3 font-mono">
                        <span className="notranslate" translate="no">{article.author_name || 'EMORIA'}</span>
                        <span>•</span>
                        <span>
                          {article.published_at 
                            ? new Date(article.published_at).toLocaleDateString(language === 'en' ? 'en-US' : 'vi-VN') 
                            : t('Mới cập nhật', 'Recently updated')}
                        </span>
                      </div>

                      <h2 className={`font-serif text-lg sm:text-xl font-medium text-white group-hover:text-metallic transition-colors line-clamp-2 mb-3 leading-snug ${luxury ? 'notranslate' : ''}`} translate={luxury ? 'no' : 'yes'}>
                        {displayTitle}
                      </h2>

                      <p className={`text-xs sm:text-sm text-slate-300 font-light line-clamp-3 leading-relaxed mb-4 ${luxury ? 'notranslate' : ''}`} translate={luxury ? 'no' : 'yes'}>
                        {displayExcerpt}
                      </p>
                    </div>
                  </div>

                  {/* Footer Metadata & CTA */}
                  <div className="px-6 pb-6 pt-2 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center gap-3">
                      {isAdmin && (
                        <span className="flex items-center gap-1" title={t('Lượt xem bài viết', 'Article views')}>
                          <Eye className="w-3.5 h-3.5" />
                          {article.view_count || 0}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Heart className="w-3.5 h-3.5 text-rose-400" />
                        {article.likes_count || 0}
                      </span>
                    </div>

                    <span className="inline-flex items-center gap-1 font-semibold text-white group-hover:translate-x-1 transition-transform">
                      <span>{t('Đọc tiếp', 'Read story')}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
