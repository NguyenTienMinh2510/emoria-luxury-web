import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Cpu, Sparkles, Smartphone, HeartHandshake } from 'lucide-react';

export default function AboutSection({ onOpenNfcDemo }) {
  return (
    <section 
      id="about" 
      className="relative min-h-screen w-full py-24 px-4 sm:px-6 lg:px-8 bg-dark-950 bg-diamond-pattern overflow-hidden flex flex-col justify-center"
    >
      {/* Ambient Lighting */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-slate-400/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10 text-center">
        
        {/* Section Title matching Mockup 6 */}
        <motion.h2 
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="font-cinzel text-4xl sm:text-6xl font-medium text-slate-100 tracking-wider mb-3"
        >
          ABOUT EMORIA
        </motion.h2>

        {/* Subtitle matching Mockup 6 */}
        <motion.p 
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="font-sans font-light italic text-base sm:text-xl text-neutral-300 tracking-wide mb-10 sm:mb-14"
        >
          Giao Thoa Giữa Nghệ Thuật Chế Tác &amp; Công Nghệ Cảm Xúc
        </motion.p>

        {/* Narrative Card with Glassmorphism */}
        <motion.div 
          initial={{ opacity: 0, y: 25 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="rounded-3xl glass-panel p-6 sm:p-10 md:p-14 border border-white/15 shadow-2xl backdrop-blur-2xl text-left space-y-6 sm:space-y-8"
        >
          {/* Paragraph 1 */}
          <p className="text-sm sm:text-base md:text-lg text-slate-200 leading-relaxed font-light">
            Giữa thế giới số vội vã, chúng ta chụp hàng ngàn bức ảnh, quay hàng trăm video nhưng rồi lại vô tình bỏ quên chúng trong kho lưu trữ vô tận của chiếc điện thoại. EMORIA ra đời từ một trăn trở đơn giản: <span className="text-white font-medium">Làm sao để đưa những cảm xúc ấy trở lại cuộc sống thường nhật, có thể chạm tới, cảm nhận và mang theo bên mình mỗi ngày?</span>
          </p>

          {/* Paragraph 2 */}
          <p className="text-sm sm:text-base md:text-lg text-slate-200 leading-relaxed font-light">
            Chúng tôi không chỉ tạo ra những món trang sức Bạc S925 tinh xảo. Mỗi thiết kế của EMORIA — từ chiếc nhẫn Halo, dây chuyền Emoria Lumen cho đến nhịp đập Pulse - đều mang trong mình một <span className="italic text-white">"chiếc chìa khóa số"</span>.
          </p>

          {/* Paragraph 3 */}
          <p className="text-sm sm:text-base md:text-lg text-slate-200 leading-relaxed font-light">
            Bằng việc tích hợp vi chip NFC ẩn bên dưới lớp màng cách từ tối tân, EMORIA biến mặt trang sức trở thành một <span className="font-serif font-semibold text-white tracking-wider">Memory Space riêng tư</span>. Chỉ với một cú chạm nhẹ bằng điện thoại, những thước phim kỷ niệm, giọng nói ấm áp và bức thư tay của người trao tặng sẽ tức thì sống lại - không cần cài đặt ứng dụng, không bị mai một theo thời gian.
          </p>

          {/* Sign-off */}
          <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400">Trân trọng,</p>
              <p className="font-serif text-xl sm:text-2xl font-bold text-metallic tracking-widest mt-1">EMORIA.</p>
            </div>

            <button
              onClick={() => onOpenNfcDemo && onOpenNfcDemo('emoria-lumen')}
              className="px-6 py-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/25 text-white text-xs sm:text-sm font-medium transition-all shadow-silver-glow flex items-center gap-2"
            >
              <Smartphone className="w-4 h-4 text-slate-200" />
              <span>Thử nghiệm công nghệ "Một Chạm"</span>
            </button>
          </div>
        </motion.div>

        {/* 3 Tech Pillars Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">
          <div className="p-5 rounded-2xl glass-panel border border-white/10 text-left">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-3">
              <Cpu className="w-5 h-5 text-slate-200" />
            </div>
            <h4 className="text-sm font-semibold text-white mb-1">Micro-Chip NFC Kháng Từ</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Màng chắn từ tính độc quyền bảo vệ chip NFC được tích hợp bên trong lõi bạc S925.
            </p>
          </div>

          <div className="p-5 rounded-2xl glass-panel border border-white/10 text-left">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-3">
              <Smartphone className="w-5 h-5 text-slate-200" />
            </div>
            <h4 className="text-sm font-semibold text-white mb-1">Không Cần Cài Đặt App</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Tự động mở trang Memory Space ngay trên trình duyệt điện thoại iOS &amp; Android chỉ sau 0.5s chạm.
            </p>
          </div>

          <div className="p-5 rounded-2xl glass-panel border border-white/10 text-left">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-3">
              <ShieldCheck className="w-5 h-5 text-slate-200" />
            </div>
            <h4 className="text-sm font-semibold text-white mb-1">Bảo Mật &amp; Lưu Trữ Trên Máy Chủ</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Mã hóa dữ liệu đám mây độc bản, cho phép chủ sở hữu toàn quyền cập nhật hoặc khóa riêng tư bất kỳ lúc nào.
            </p>
          </div>
        </div>

      </div>
    </section>
  );
}
