import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Music, Play, Pause, Check, X, Sparkles, Volume2 } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageProvider.jsx';

export const CURATED_MELODIES = [
  {
    id: 'clair-de-lune',
    titleVi: 'Ánh Trăng Tinh Khôi (Clair de Lune)',
    titleEn: 'Clair de Lune (Pure Moonlight)',
    composer: 'Claude Debussy',
    moodVi: 'Thơ mộng, Dịu êm, Lãng mạn',
    moodEn: 'Dreamy, Gentle, Romantic',
    url: 'https://upload.wikimedia.org/wikipedia/commons/2/23/Clair_de_lune_%28Claude_Debussy%29_Suite_bergamasque.ogg'
  },
  {
    id: 'nocturne-op9',
    titleVi: 'Dạ Khúc Tình Yêu (Nocturne Op. 9 No. 2)',
    titleEn: 'Love Nocturne (Op. 9 No. 2)',
    composer: 'Frédéric Chopin',
    moodVi: 'Sâu lắng, Ngọt ngào, Quý phái',
    moodEn: 'Deep, Sweet, Graceful',
    url: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Fr%C3%A9d%C3%A9ric_Chopin_-_Nocturne_Op._9%2C_No._2.ogg'
  },
  {
    id: 'gymnopedie',
    titleVi: 'Giai Điệu Bình Yên (Gymnopédie No. 1)',
    titleEn: 'Peaceful Reverie (Gymnopédie No. 1)',
    composer: 'Erik Satie',
    moodVi: 'Tĩnh lặng, Chữa lành, Hoài niệm',
    moodEn: 'Calm, Healing, Nostalgic',
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Erik_Satie_-_gymnopedie_no_1.ogg'
  },
  {
    id: 'liebestraum',
    titleVi: 'Giấc Mộng Tình Yêu (Liebestraum No. 3)',
    titleEn: 'Dream of Love (Liebestraum No. 3)',
    composer: 'Franz Liszt',
    moodVi: 'Nồng nàn, Mãnh liệt, Vĩnh cửu',
    moodEn: 'Passionate, Intense, Eternal',
    url: 'https://upload.wikimedia.org/wikipedia/commons/d/df/Liszt_Liebestraum_3.ogg'
  },
  {
    id: 'canon-in-d',
    titleVi: 'Lời Hẹn Ước Trăm Năm (Canon in D)',
    titleEn: 'Everlasting Vow (Canon in D)',
    composer: 'Johann Pachelbel',
    moodVi: 'Hân hoan, Sang trọng, Thiêng liêng',
    moodEn: 'Joyful, Elegant, Sacred',
    url: 'https://upload.wikimedia.org/wikipedia/commons/7/77/Pachelbel%27s_Canon.ogg'
  },
  {
    id: 'air-on-g',
    titleVi: 'Khúc Ca Bất Tận (Air on the G String)',
    titleEn: 'Endless Song (Air on the G String)',
    composer: 'J.S. Bach',
    moodVi: 'Trang nhã, Quý phái, Lắng đọng',
    moodEn: 'Noble, Poetic, Meditative',
    url: 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Bach_-_Air_on_the_G_String.ogg'
  }
];

export default function CuratedMelodiesModal({
  isOpen,
  onClose,
  onSelectMelody,
  currentAudioUrl = ''
}) {
  const { t, language } = useLanguage();
  const [playingId, setPlayingId] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  const togglePlay = (melody) => {
    if (playingId === melody.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(melody.url);
      audioRef.current = audio;
      audio.play().catch(() => {});
      audio.onended = () => setPlayingId(null);
      setPlayingId(melody.id);
    }
  };

  const handleChoose = (melody) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const title = language === 'en' ? melody.titleEn : melody.titleVi;
    onSelectMelody({ title, url: melody.url });
    onClose();
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-dark-950/85 backdrop-blur-xl"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.93, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.93, y: 20 }}
          transition={{ duration: 0.3 }}
          className="relative w-full max-w-2xl rounded-3xl p-6 sm:p-8 bg-dark-900/95 border border-amber-400/30 shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_30px_rgba(212,175,55,0.15)] text-slate-100 max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            aria-label={t('Đóng', 'Close')}
            className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400/20 to-yellow-600/30 border border-amber-400/40 flex items-center justify-center text-amber-300 shadow-[0_0_15px_rgba(212,175,55,0.3)]">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-xl sm:text-2xl font-bold text-metallic">
                {t('Kho Giai Điệu Chọn Lọc Emoria', 'Emoria Curated Keepsake Melodies')}
              </h3>
              <p className="text-xs text-slate-400">
                {t('Các bản hòa tấu bất hủ chất lượng cao, sẵn sàng gắn làm nhạc nền kỷ vật bằng 1 chạm',
                   'Timeless classical masterpieces ready to accompany your memory space in one tap')}
              </p>
            </div>
          </div>

          {/* Melodies List */}
          <div className="space-y-3 mb-6">
            {CURATED_MELODIES.map((melody) => {
              const title = language === 'en' ? melody.titleEn : melody.titleVi;
              const mood = language === 'en' ? melody.moodEn : melody.moodVi;
              const isSelected = currentAudioUrl === melody.url;
              const isPlaying = playingId === melody.id;

              return (
                <div
                  key={melody.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-amber-400/10 border-amber-400/50 shadow-[0_0_15px_rgba(212,175,55,0.2)]'
                      : 'bg-black/50 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => togglePlay(melody)}
                      aria-label={isPlaying ? t('Tạm dừng', 'Pause') : t('Nghe thử', 'Preview')}
                      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer ${
                        isPlaying
                          ? 'bg-amber-400 text-dark-950 shadow-[0_0_15px_rgba(212,175,55,0.5)]'
                          : 'bg-white/10 text-white hover:bg-white/20'
                      }`}
                    >
                      {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 ml-0.5 fill-current" />}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-white truncate font-serif">
                          {title}
                        </h4>
                        {isSelected && (
                          <span className="px-2 py-0.2 rounded text-[9px] font-mono bg-amber-400/20 text-amber-300 border border-amber-400/40 shrink-0">
                            {t('Đang chọn', 'Selected')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 truncate">
                        {melody.composer} · <span className="italic text-slate-400">{mood}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleChoose(melody)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                        isSelected
                          ? 'bg-white/10 text-slate-300 hover:bg-white/20 border border-white/20'
                          : 'bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 text-dark-950 hover:brightness-110 shadow-[0_0_15px_rgba(212,175,55,0.3)]'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isSelected ? t('Đang dùng bài này', 'Currently Active') : t('Chọn bài này', 'Choose this')}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-400 text-center italic">
            ✦ {t('Các bản nhạc được cấp phép sử dụng phi thương mại và lưu giữ trọn đời cùng kỷ vật',
                 'All melodies are open-licensed and safely preserved for lifetime enjoyment with your keepsakes')} ✦
          </p>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
