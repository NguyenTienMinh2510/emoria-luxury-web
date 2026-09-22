import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Heart, Feather, Loader2, Check, RefreshCw } from 'lucide-react';
import { apiRequest } from '../services/apiClient.js';
import { useLanguage } from '../i18n/LanguageProvider.jsx';

export default function AiLetterMuseModal({
  isOpen,
  onClose,
  onApply,
  author = '',
  recipient = ''
}) {
  const { t, language } = useLanguage();
  const [consent,setConsent]=useState(false);
  const [occasion, setOccasion] = useState('anniversary');
  const [tone, setTone] = useState('romantic');
  const [memoryHint, setMemoryHint] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedLetter, setGeneratedLetter] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest('/ai/craft-letter', {
        method: 'POST',
        body: {
          consent,
          occasion,
          tone,
          memoryHint,
          author: author || (language === 'en' ? 'Sender' : 'Người gửi'),
          recipient: recipient || (language === 'en' ? 'Beloved' : 'Người thương'),
          language
        }
      });
      if (res?.letter) {
        setGeneratedLetter(res.letter);
      } else {
        setError(t('Không nhận được phản hồi từ trợ lý AI. Vui lòng thử lại.', 'No response received from AI. Please try again.'));
      }
    } catch (err) {
      setError(err.message || t('Lỗi khi chắp bút thư tay.', 'Failed to craft letter.'));
    } finally {
      setLoading(false);
    }
  };

  const handleInsert = () => {
    if (!generatedLetter) return;
    onApply(generatedLetter);
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
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400/20 to-yellow-600/30 border border-amber-400/40 flex items-center justify-center text-amber-300 shadow-[0_0_15px_rgba(212,175,55,0.3)]">
              <Feather className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-xl sm:text-2xl font-bold text-metallic">
                {t('Trợ Lý Chắp Bút Thư Tay Kỷ Vật', 'Keepsake Letter Muse')}
              </h3>
              <p className="text-xs text-slate-400">
                {t('Gợi mở những dòng tâm sự chạm tới cảm xúc để gửi kèm trang sức kỷ vật',
                   'Craft poetic, heartfelt words to accompany your luxury jewelry keepsake')}
              </p>
            </div>
          </div>

          {/* Settings Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">
            {/* Occasion */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                {t('Dịp trao tặng', 'Occasion')}
              </label>
              <select
                value={occasion}
                onChange={(e) => setOccasion(e.target.value)}
                disabled={loading}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/20 text-xs text-slate-200 focus:outline-none focus:border-amber-400/60 cursor-pointer"
              >
                <option value="anniversary">{t('Kỷ niệm ngày cưới / Tình yêu', 'Wedding / Love Anniversary')}</option>
                <option value="proposal">{t('Lời hẹn ước / Cầu hôn', 'Proposal & Promise')}</option>
                <option value="birthday">{t('Sinh nhật người thương', 'Beloved Birthday')}</option>
                <option value="gratitude">{t('Tri ân cha mẹ / Đấng sinh thành', 'Gratitude to Parents')}</option>
                <option value="friendship">{t('Bạn thân tri kỷ', 'Soulmate / True Friend')}</option>
              </select>
            </div>

            {/* Tone */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                {t('Tông giọng cảm xúc', 'Emotional Tone')}
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                disabled={loading}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/20 text-xs text-slate-200 focus:outline-none focus:border-amber-400/60 cursor-pointer"
              >
                <option value="romantic">{t('Lãng mạn & Sâu lắng', 'Deep & Romantic')}</option>
                <option value="poetic">{t('Thơ mộng & Quý phái', 'Poetic & Graceful')}</option>
                <option value="warm">{t('Dịu dàng & Ấm áp', 'Warm & Gentle')}</option>
                <option value="sincere">{t('Chân thành & Mộc mạc', 'Sincere & Heartfelt')}</option>
              </select>
            </div>
          </div>

          {/* Optional memory hint */}
          <div className="mb-6">
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider flex items-center justify-between">
              <span>{t('Kỷ niệm gợi ý (tùy chọn)', 'Personal memory hint (optional)')}</span>
              <span className="text-[10px] text-slate-500">{memoryHint.length}/120</span>
            </label>
            <input
              type="text"
              maxLength={120}
              placeholder={t('Ví dụ: Chuyến đi Hội An dưới mưa, 5 năm đồng hành vượt khó...',
                             'e.g., First trip to Paris, 5 years journey together...')}
              value={memoryHint}
              onChange={(e) => setMemoryHint(e.target.value)}
              disabled={loading}
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/20 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/60"
            />
          </div>

          <label className="flex items-start gap-2 text-xs mb-4"><input type="checkbox" checked={consent} disabled={loading} onChange={e=>setConsent(e.target.checked)}/>{t('Tôi đồng ý gửi tên và kỷ niệm đã nhập cho Google để tạo thư.','I consent to sending the names and memories entered here to Google to create a letter.')}</label>
          {/* Action Button: Generate */}
          <div className="mb-6">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading||!consent}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 text-dark-950 font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(212,175,55,0.35)] disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-dark-950" />
                  <span>{t('Đang chắp bút tâm sự...', 'Crafting your letter...')}</span>
                </>
              ) : (
                <>
                  <Feather className="w-4 h-4 text-dark-950" />
                  <span>{generatedLetter ? t('Khởi tạo bản nháp khác', 'Craft another draft') : t('Khởi tạo Thư tay', 'Craft Keepsake Letter')}</span>
                </>
              )}
            </button>
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-400 mb-4 text-center">
              {error}
            </p>
          )}

          {/* Generated Result Preview */}
          {generatedLetter && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-5 sm:p-6 rounded-2xl bg-black/60 border border-amber-400/30 space-y-4 shadow-inner relative overflow-hidden"
            >
              <div className="flex items-center justify-between text-xs text-amber-300 border-b border-white/10 pb-2 font-mono">
                <span className="flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5 fill-amber-300" />
                  <span>{t('Bản Thư Tay Kỷ Vật Hoàn Chỉnh', 'Crafted Keepsake Letter')}</span>
                </span>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={loading}
                  className="text-slate-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>{t('Tạo lại', 'Regenerate')}</span>
                </button>
              </div>

              <div className="font-serif text-sm sm:text-base text-slate-200 leading-relaxed whitespace-pre-line italic">
                {generatedLetter}
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleInsert}
                  className="px-5 py-2 rounded-xl bg-white hover:bg-slate-200 text-dark-950 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-silver-glow"
                >
                  <Check className="w-4 h-4" />
                  <span>{t('Chèn vào Thư tay Studio', 'Insert into Studio Letter')}</span>
                </button>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
