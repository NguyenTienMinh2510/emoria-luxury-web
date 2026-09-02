import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Phone, Mail, MapPin, Clock, Send, CheckCircle2, MessageSquare } from 'lucide-react';

export default function ContactSection() {
  const [formData, setFormData] = useState({ name: '', phone: '', note: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setFormData({ name: '', phone: '', note: '' });
    }, 3000);
  };

  return (
    <section 
      id="contact" 
      className="relative min-h-[90vh] w-full py-20 px-4 sm:px-6 lg:px-8 bg-dark-900 border-t border-white/10 overflow-hidden flex flex-col justify-center"
    >
      {/* Background Diamond Lattice */}
      <div className="absolute inset-0 bg-diamond-pattern opacity-50 pointer-events-none" />

      {/* Decorative Glow */}
      <div className="absolute bottom-10 right-10 w-[500px] h-[500px] bg-slate-400/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-6xl mx-auto w-full relative z-10">
        
        {/* Section Title & Subtitle matching Mockup 7 */}
        <div className="text-center max-w-4xl mx-auto mb-14 space-y-4">
          <motion.h2 
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="font-serif text-2xl sm:text-4xl lg:text-5xl font-normal text-slate-100 tracking-wide leading-snug"
          >
            EMORIA sẵn sàng lắng nghe câu chuyện của bạn.
          </motion.h2>

          <motion.p 
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-sans font-light italic text-sm sm:text-base text-neutral-300 leading-relaxed tracking-wider max-w-3xl mx-auto px-4"
          >
            Dù bạn cần tư vấn chọn món quà phù hợp, hỗ trợ kỹ thuật nạp ký ức NFC, hay mong muốn hợp tác cùng EMORIA - đội ngũ của chúng tôi luôn ở đây để đồng hành cùng bạn.
          </motion.p>
        </div>

        {/* 2 Columns: Contact Info (Left) & Social Channels + Quick Form (Right) matching Mockup 7 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
          
          {/* Left Column: Direct Info matching Mockup 7 */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-6 rounded-3xl glass-panel p-6 sm:p-10 border border-white/15 flex flex-col justify-between space-y-6 shadow-xl"
          >
            <div className="space-y-6 text-slate-200">
              
              {/* Hotline / Zalo */}
              <div className="flex items-start gap-4 group">
                <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0 group-hover:border-white/50 group-hover:bg-white/20 transition-all">
                  <Phone className="w-5 h-5 text-slate-200" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Hotline / Zalo</p>
                  <a href="tel:0968666768" className="text-base sm:text-xl font-semibold text-white hover:text-slate-300 transition-colors">
                    0968666768
                  </a>
                </div>
              </div>

              {/* Email */}
              <div className="flex items-start gap-4 group">
                <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0 group-hover:border-white/50 group-hover:bg-white/20 transition-all">
                  <Mail className="w-5 h-5 text-slate-200" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Email Hỗ Trợ</p>
                  <a href="mailto:Emoria@gmail.com" className="text-base sm:text-xl font-semibold text-white hover:text-slate-300 transition-colors">
                    Emoria@gmail.com
                  </a>
                </div>
              </div>

              {/* Store Location */}
              <div className="flex items-start gap-4 group">
                <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0 group-hover:border-white/50 group-hover:bg-white/20 transition-all">
                  <MapPin className="w-5 h-5 text-slate-200" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Flagship Store</p>
                  <p className="text-base sm:text-lg font-medium text-white leading-snug">
                    Số 1, Nam Kỳ Khởi Nghĩa, Quận 1, TP.HCM
                  </p>
                </div>
              </div>

              {/* Operating Hours */}
              <div className="flex items-start gap-4 group">
                <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0 group-hover:border-white/50 group-hover:bg-white/20 transition-all">
                  <Clock className="w-5 h-5 text-slate-200" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Giờ hoạt động</p>
                  <p className="text-base sm:text-lg font-medium text-white">
                    9:00 AM - 22:00 PM
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">(Tất cả các ngày trong tuần)</p>
                </div>
              </div>

            </div>

            {/* Quick Map / Showroom Pin Tag */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-white">Trải nghiệm trực tiếp tại Store</p>
                <p className="text-[11px] text-slate-400">Có kỹ thuật viên nạp ký ức NFC tại chỗ</p>
              </div>
              <a 
                href="https://maps.google.com" 
                target="_blank" 
                rel="noreferrer"
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white transition-colors"
              >
                Chỉ đường
              </a>
            </div>
          </motion.div>

          {/* Right Column: Social Channels & Quick Inquiry Form matching Mockup 7 */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="lg:col-span-6 rounded-3xl glass-panel p-6 sm:p-10 border border-white/15 flex flex-col justify-between space-y-6 shadow-xl"
          >
            {/* Social Channels List matching Mockup 7 */}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">
                Kênh Mạng Xã Hội Chính Thức
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Facebook: EMORIA VIETNAM */}
                <a 
                  href="https://facebook.com" 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/30 transition-all group"
                >
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    {/* Facebook Icon */}
                    <svg className="w-5 h-5 fill-current text-white" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-white group-hover:text-slate-200">EMORIA VIETNAM</span>
                </a>

                {/* Instagram: EMORIA.VN */}
                <a 
                  href="https://instagram.com" 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/30 transition-all group"
                >
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    {/* Instagram Icon */}
                    <svg className="w-5 h-5 fill-current text-white" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-white group-hover:text-slate-200">EMORIA.VN</span>
                </a>

                {/* TikTok: EMORIA */}
                <a 
                  href="https://tiktok.com" 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/30 transition-all group"
                >
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    {/* TikTok Icon */}
                    <svg className="w-5 h-5 fill-current text-white" viewBox="0 0 24 24">
                      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-white group-hover:text-slate-200">EMORIA</span>
                </a>

                {/* Locket: Locket của EMORIA ... */}
                <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/5 border border-white/10 group">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    {/* Heart/Locket Icon */}
                    <svg className="w-5 h-5 fill-current text-rose-300" viewBox="0 0 24 24">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-white">Locket của EMORIA ...</span>
                </div>
              </div>
            </div>

            {/* Quick Contact Form */}
            <div className="pt-4 border-t border-white/10">
              <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-slate-300" />
                <span>Gửi lời nhắn yêu cầu tư vấn</span>
              </h4>

              {submitted ? (
                <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>Cảm ơn bạn! Chuyên viên EMORIA sẽ liên hệ lại trong vòng 15 phút.</span>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      id="contact-name"
                      name="name"
                      type="text"
                      required
                      placeholder="Tên của bạn"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full h-10 px-3.5 rounded-xl glass-input text-xs"
                    />
                    <input
                      id="contact-phone"
                      name="phone"
                      type="tel"
                      required
                      placeholder="Số điện thoại / Zalo"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full h-10 px-3.5 rounded-xl glass-input text-xs"
                    />
                  </div>
                  <input
                    id="contact-note"
                    name="note"
                    type="text"
                    placeholder="Mẫu trang sức hoặc câu chuyện bạn muốn tư vấn..."
                    value={formData.note}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                    className="w-full h-10 px-3.5 rounded-xl glass-input text-xs"
                  />
                  <button
                    type="submit"
                    className="w-full h-10 rounded-xl bg-white text-dark-950 font-bold text-xs hover:bg-slate-200 transition-all flex items-center justify-center gap-2 shadow-sm"
                  >
                    <span>Gửi Yêu Cầu Hỗ Trợ</span>
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              )}
            </div>

          </motion.div>

        </div>

      </div>
    </section>
  );
}
