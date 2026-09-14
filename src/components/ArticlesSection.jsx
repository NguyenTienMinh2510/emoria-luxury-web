import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, Eye, Heart, Clock } from 'lucide-react';
import { getPublishedArticles } from '../services/articleService';

export default function ArticlesSection({ onSelectArticle, onNavigateToArticles }) {
  const [featuredArticles, setFeaturedArticles] = useState([]);

  useEffect(() => {
    let active = true;
    getPublishedArticles({ limit: 3 }).then((res) => {
      if (active && res.success) {
        setFeaturedArticles(res.articles.slice(0, 3));
      }
    });
    return () => { active = false; };
  }, []);

  if (featuredArticles.length === 0) return null;

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-dark-950 via-dark-900 to-dark-950 border-t border-white/5 relative overflow-hidden">
      <div className="max-w-7xl mx-auto relative z-10">
        
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-14">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-semibold tracking-widest text-slate-300 uppercase mb-3 shadow-silver-glow">
              <Sparkles className="w-3.5 h-3.5 text-slate-300 animate-pulse" />
              <span>Góc Nhìn Nghệ Nhân</span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal tracking-wide text-metallic">
              CÂU CHUYỆN & TINH HOA
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-2 font-light max-w-xl">
              Khám phá nghệ thuật chế tác kim hoàn, triết lý lưu giữ ký ức và những công nghệ đột phá định hình tương lai của EMORIA.
            </p>
          </div>

          <button
            onClick={onNavigateToArticles}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/5 border border-white/15 hover:bg-white/10 text-xs font-semibold tracking-wider text-slate-200 hover:text-white uppercase transition-all duration-300 cursor-pointer w-fit shadow-inner group"
          >
            <span>Xem Tất Cả Bài Viết</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* 3 Featured Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {featuredArticles.map((article, index) => (
            <motion.article
              key={article.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              onClick={() => onSelectArticle(article.slug)}
              className="group relative rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/30 overflow-hidden cursor-pointer backdrop-blur-xl transition-all duration-300 hover:shadow-silver-glow flex flex-col justify-between"
            >
              <div>
                <div className="relative aspect-[16/10] overflow-hidden">
                  <img
                    src={article.cover_image}
                    alt={article.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-dark-950 via-dark-950/20 to-transparent" />
                  <span className="absolute top-3 left-3 px-3 py-1 rounded-full text-[10px] font-semibold tracking-wider bg-black/60 border border-white/20 text-slate-200 backdrop-blur-md uppercase">
                    {article.category}
                  </span>
                </div>

                <div className="p-6">
                  <div className="text-[11px] text-slate-400 mb-2 font-mono">
                    {article.published_at ? new Date(article.published_at).toLocaleDateString('vi-VN') : 'Mới cập nhật'}
                  </div>
                  <h3 className="font-serif text-lg font-medium text-white group-hover:text-metallic transition-colors line-clamp-2 mb-3">
                    {article.title}
                  </h3>
                  <p className="text-xs text-slate-300 font-light line-clamp-3 leading-relaxed">
                    {article.excerpt}
                  </p>
                </div>
              </div>

              <div className="px-6 pb-6 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" />
                    {article.view_count || 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <Heart className="w-3.5 h-3.5 text-rose-400" />
                    {article.likes_count || 0}
                  </span>
                </div>

                <span className="font-semibold text-white group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                  <span>Khám phá</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </motion.article>
          ))}
        </div>

      </div>
    </section>
  );
}
