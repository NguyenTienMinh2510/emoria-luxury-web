import React from 'react';
import { motion } from 'framer-motion';
import { 
  Sparkles, ShieldCheck, Cpu, Smartphone, HeartHandshake, 
  Layers, Disc, Award, Clock, ArrowRight, Lock, Eye, CheckCircle2,
  Gem, Compass, Gift, History, MapPin, Phone, Mail, Navigation,
  Building2, ExternalLink
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageProvider';

export default function AboutView({ 
  onNavigateToShop, 
  onNavigateToMemory, 
  onOpenNfcDemo,
  onOpenPrivacy,
}) {
  const { language, t } = useLanguage();
  const isEn = language === 'en';

  return (
    <div className="min-h-screen bg-dark-950 text-slate-100 selection:bg-slate-200 selection:text-dark-950 overflow-x-hidden pt-20 sm:pt-24 pb-20">
      
      {/* Background Ambience */}
      <div className="fixed inset-0 bg-diamond-pattern opacity-40 pointer-events-none z-0" />
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[550px] bg-slate-500/5 rounded-full blur-[140px] pointer-events-none z-0" />
      <div className="fixed bottom-10 right-10 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[160px] pointer-events-none z-0" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 space-y-24 sm:space-y-32">
        
        {/* 1. HERO BANNER CINEMATIC */}
        <section className="text-center pt-8 sm:pt-14">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="flex flex-col items-center"
          >
            {/* Atelier Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/20 text-xs sm:text-sm text-slate-200 font-sans uppercase tracking-[0.25em] mb-6 shadow-silver-glow">
              <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
              <span>EMORIA · TRANG SỨC BẠC CÔNG NGHỆ S925 (EMORIA.VN)</span>
            </div>

            {/* Main Headline */}
            <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-normal text-white tracking-wide leading-tight max-w-4xl">
              Nơi Nghệ Thuật Kim Hoàn Giao Thoa Cùng <span className="text-metallic italic font-light">Kỷ Niệm Vĩnh Cửu</span>
            </h1>
            {isEn && (
              <p className="font-serif italic text-xs sm:text-sm text-amber-200/80 tracking-widest uppercase mt-2">
                Where Master Craftsmanship Meets Eternal Memories
              </p>
            )}

            {/* Slogan */}
            <div className="flex flex-col items-center justify-center mt-4 mb-8">
              <div className="flex items-center justify-center gap-3">
                <span className="w-12 h-px bg-gradient-to-r from-transparent via-slate-400 to-transparent" />
                <p className="font-sans font-medium text-xs sm:text-sm md:text-base tracking-[0.3em] uppercase text-slate-300">
                  MỘT CHẠM MỞ KÍ ỨC · TRỌN ĐỜI GIỮ YÊU THƯƠNG
                </p>
                <span className="w-12 h-px bg-gradient-to-r from-transparent via-slate-400 to-transparent" />
              </div>
              {isEn && (
                <p className="text-[10px] sm:text-xs text-slate-400 font-sans tracking-[0.2em] uppercase mt-1">
                  One Tap To Awaken Memories · Lifetime Of Cherished Love
                </p>
              )}
            </div>

            <p className="font-sans text-base sm:text-lg text-slate-300 font-light max-w-2xl mx-auto leading-relaxed mb-10">
              EMORIA không chỉ sáng tạo nên những kiệt tác Bạc S925 thanh nhã. Chúng tôi trao quyền năng biến mỗi món trang sức trở thành một không gian lưu giữ khoảnh khắc thiêng liêng nhất của cuộc đời bạn.
            </p>

            {/* Quick Hero CTAs */}
            <div className="flex flex-wrap items-center justify-center gap-4">
              <button
                onClick={onNavigateToShop}
                className="cta-luxury-gold !px-8 !py-3.5 shadow-[0_0_30px_rgba(250,204,21,0.6)]"
              >
                <span>{isEn ? "Khám Phá Cửa Hàng · Explore Shop" : "Khám Phá Cửa Hàng"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => onOpenNfcDemo && onOpenNfcDemo('emoria-lumen')}
                className="cta-luxury-secondary !px-7 !py-3.5"
              >
                <Smartphone className="w-4 h-4 text-slate-300" />
                <span>{isEn ? "Trải Nghiệm \"Một Chạm\" · One-Tap Demo" : "Trải Nghiệm \"Một Chạm\""}</span>
              </button>
            </div>
          </motion.div>

          {/* Key Metric Highlights Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mt-16 pt-10 border-t border-white/10">
            <div className="p-5 rounded-2xl glass-panel border border-white/10 text-center">
              <p className="font-serif text-2xl sm:text-3xl font-bold text-white mb-1">100%</p>
              <p className="text-xs text-slate-400 font-sans tracking-wider uppercase">
                Bạc Ý S925 Đúc Khối {isEn && <span className="block text-[10px] text-amber-200/70">Solid Italian S925</span>}
              </p>
            </div>
            <div className="p-5 rounded-2xl glass-panel border border-white/10 text-center">
              <p className="font-serif text-2xl sm:text-3xl font-bold text-amber-300 mb-1">0.5 Giây</p>
              <p className="text-xs text-slate-400 font-sans tracking-wider uppercase">
                Tốc Độ Chạm Đọc NFC {isEn && <span className="block text-[10px] text-amber-200/70">0.5s NFC Instant Tap</span>}
              </p>
            </div>
            <div className="p-5 rounded-2xl glass-panel border border-white/10 text-center">
              <p className="font-serif text-2xl sm:text-3xl font-bold text-white mb-1">IP68</p>
              <p className="text-xs text-slate-400 font-sans tracking-wider uppercase">
                Chuẩn Kháng Nước &amp; Bụi {isEn && <span className="block text-[10px] text-amber-200/70">IP68 Water Resistant</span>}
              </p>
            </div>
            <div className="p-5 rounded-2xl glass-panel border border-white/10 text-center">
              <p className="font-serif text-2xl sm:text-3xl font-bold text-emerald-400 mb-1">Trọn Đời</p>
              <p className="text-xs text-slate-400 font-sans tracking-wider uppercase">
                Lưu Giữ Kỷ Niệm Số {isEn && <span className="block text-[10px] text-amber-200/70">Lifetime Memory Vault</span>}
              </p>
            </div>
          </div>
        </section>

        {/* 2. BRAND MANIFESTO & PHILOSOPHY */}
        <section className="relative">
          <div className="rounded-3xl glass-panel p-8 sm:p-12 md:p-16 border border-white/15 shadow-2xl bg-white/[0.02] relative overflow-hidden">
            <div className="absolute -right-16 -bottom-16 w-80 h-80 bg-white/5 rounded-full blur-3xl pointer-events-none" />
            
            <div className="max-w-3xl space-y-6">
              <div className="flex items-center gap-2 text-xs font-sans font-bold uppercase tracking-[0.25em] text-amber-300">
                <HeartHandshake className="w-4 h-4" />
                <span>Tuyên Ngôn Thương Hiệu</span>
              </div>

              <h2 className="font-serif text-2xl sm:text-4xl font-normal text-white leading-snug">
                Đưa Kỷ Niệm Trở Lại Cuộc Sống Thường Nhật Thay Vì Bị Lãng Quên Trong Bộ Nhớ Số
              </h2>

              <div className="space-y-5 text-slate-300 text-sm sm:text-base leading-relaxed font-light">
                <p>
                  Trong thế giới số vội vã ngày nay, chúng ta chụp hàng nghìn bức ảnh mỗi năm, ghi lại hàng trăm đoạn video ngắn trong các dịp sinh nhật, chuyến du lịch hay khoảnh khắc cầu hôn. Thế nhưng, đa phần những ký ức vô giá ấy lại vô tình bị chôn vùi trong kho thư viện ảnh vô tận của chiếc điện thoại thông minh, hiếm khi được mở lại.
                </p>
                <p>
                  <strong className="text-white font-medium">EMORIA ra đời từ một câu hỏi trăn trở:</strong> Làm sao để trao cho những cảm xúc thiêng liêng một "thực thể vật lý" sang trọng, để người ta có thể mang theo bên mình mọi lúc, chạm vào bất cứ khi nào nhớ nhung, và cảm nhận hơi ấm của người trao tặng?
                </p>
                <p>
                  Bằng cách kết hợp đỉnh cao của kỹ nghệ kim hoàn Bạc Ý S925 với vi mạch cảm ứng NFC và nền tảng <span className="text-white font-medium">Memory Space</span>, EMORIA biến chiếc dây chuyền hay vòng tay thành một chiếc chìa khóa số bí mật. Không cần cài đặt ứng dụng phức tạp, chỉ một cú chạm nhẹ bằng điện thoại, thế giới kỷ niệm riêng tư sẽ ngay lập tức bừng sáng.
                </p>
              </div>

              <div className="pt-6 border-t border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-widest text-slate-400">Sáng lập &amp; Chế tác bởi</p>
                  <p className="font-serif text-xl sm:text-2xl font-bold text-metallic tracking-widest mt-1">EMORIA ATELIER</p>
                </div>
                <div className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center text-white/80 font-serif font-bold text-xl">
                  ✦
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. TWO FOUNDATIONAL PILLARS: CRAFTSMANSHIP & EMOTIONAL TECH */}
        <section className="space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <h3 className="font-serif text-2xl sm:text-4xl font-normal text-white">
              Hai Trụ Cột Độc Bản Của EMORIA
            </h3>
            <p className="text-sm text-slate-300 font-light leading-relaxed">
              Sự hài hòa tuyệt đối giữa tinh hoa kim hoàn truyền thống và công nghệ vi mạch không dây tiên phong.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Pillar 1: Artisanal Jewelry */}
            <div className="rounded-3xl glass-panel p-8 sm:p-10 border border-white/15 space-y-6 hover:border-white/35 transition-all bg-white/[0.02]">
              <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white">
                <Gem className="w-7 h-7 stroke-[1.5]" />
              </div>

              <div>
                <span className="text-xs font-sans font-bold uppercase tracking-widest text-slate-400">Trụ Cột 01</span>
                <h4 className="font-serif text-2xl font-bold text-white mt-1">
                  Nghệ Thuật Kim Hoàn Bạc Ý S925
                </h4>
              </div>

              <ul className="space-y-4 text-sm text-slate-300 font-light leading-relaxed">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-slate-100 shrink-0 mt-0.5" />
                  <span><strong>Đúc Khối Nguyên Chất:</strong> 92.5% Bạc nguyên chất kết hợp hợp kim chống biến dạng cao cấp, tạo độ cứng cáp và giữ form dáng bền bỉ qua năm tháng.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-slate-100 shrink-0 mt-0.5" />
                  <span><strong>Xi Phủ Bạch Kim Rhodium:</strong> Ba lớp xi mạ Rhodium quý hiếm mang đến ánh sáng bóng gương sang trọng, đồng thời ngăn ngừa oxy hóa và xỉn màu do mồ hôi.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-slate-100 shrink-0 mt-0.5" />
                  <span><strong>Đính Đá Trung Tâm Cắt Gọt Tinh Xảo:</strong> Viên đá chủ tượng trưng cho ngọn hải đăng ký ức, phản chiếu ánh sáng rực rỡ ở mọi góc nhìn.</span>
                </li>
              </ul>
            </div>

            {/* Pillar 2: Sentimental NFC Tech */}
            <div className="rounded-3xl glass-panel p-8 sm:p-10 border border-white/15 space-y-6 hover:border-amber-300/40 transition-all bg-white/[0.02]">
              <div className="w-14 h-14 rounded-2xl bg-amber-400/20 border border-amber-300/30 flex items-center justify-center text-amber-300">
                <Cpu className="w-7 h-7 stroke-[1.5]" />
              </div>

              <div>
                <span className="text-xs font-sans font-bold uppercase tracking-widest text-amber-300">Trụ Cột 02</span>
                <h4 className="font-serif text-2xl font-bold text-white mt-1">
                  Công Nghệ Kỷ Niệm Số "Một Chạm"
                </h4>
              </div>

              <ul className="space-y-4 text-sm text-slate-300 font-light leading-relaxed">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
                  <span><strong>Lá Chắn Từ Ferrite Độc Quyền:</strong> Khắc phục hoàn toàn hiện tượng kim loại bạc gây nhiễu sóng, giúp vi chip NFC truyền dữ liệu tức thì chỉ sau 0.5s chạm.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
                  <span><strong>Hoạt Động Không Dùng Pin:</strong> Vi chip vận hành nhờ cảm ứng điện từ trường phát ra từ smartphone. Bạn không bao giờ phải lo lắng về việc sạc pin hay thay linh kiện.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
                  <span><strong>Bảo Mật Bằng Mã PIN Thư Tay:</strong> Chủ nhân có thể thiết lập mã PIN riêng tư cho bức thư tay, đảm bảo chỉ người được trao quyền mới có thể mở ra xem.</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* 4. THE 4-STEP CRAFTSMANSHIP PROCESS */}
        <section className="space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300 font-sans uppercase tracking-[0.2em]">
              <Layers className="w-3.5 h-3.5 text-slate-300" />
              <span>Quy Trình Hoàn Thiện</span>
            </div>
            <h3 className="font-serif text-2xl sm:text-4xl font-normal text-white">
              Bốn Công Đoạn Chế Tác Nghiêm Ngặt
            </h3>
            <p className="text-sm text-slate-300 font-light">
              Mỗi sản phẩm xuất xưởng từ EMORIA Atelier phải vượt qua hơn 30 bài kiểm định chất lượng vật lý và sóng vô tuyến.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 rounded-2xl glass-panel border border-white/10 space-y-4 hover:bg-white/[0.05] transition-all">
              <span className="font-mono text-xs font-bold text-slate-400 bg-white/10 px-2.5 py-1 rounded-md">BƯỚC 01</span>
              <h5 className="font-serif text-lg font-bold text-white">Thiết Kế 3D &amp; Tạo Mẫu Sáp</h5>
              <p className="text-xs text-slate-300 leading-relaxed font-light">
                Phác thảo tỷ lệ vàng công thái học, tính toán chuẩn xác buồng chứa rỗng bên trong mặt trang sức để bảo toàn tính thẩm mỹ thanh thoát.
              </p>
            </div>

            <div className="p-6 rounded-2xl glass-panel border border-white/10 space-y-4 hover:bg-white/[0.05] transition-all">
              <span className="font-mono text-xs font-bold text-slate-400 bg-white/10 px-2.5 py-1 rounded-md">BƯỚC 02</span>
              <h5 className="font-serif text-lg font-bold text-white">Đúc Áp Lực Bạc Ý S925</h5>
              <p className="text-xs text-slate-300 leading-relaxed font-light">
                Nung chảy bạc S925 dưới môi trường chân không, loại bỏ triệt để bọt khí, tạo nên kết cấu bạc đúc nguyên khối đồng nhất và đầm tay.
              </p>
            </div>

            <div className="p-6 rounded-2xl glass-panel border border-white/10 space-y-4 hover:bg-white/[0.05] transition-all">
              <span className="font-mono text-xs font-bold text-amber-300 bg-amber-400/20 px-2.5 py-1 rounded-md">BƯỚC 03</span>
              <h5 className="font-serif text-lg font-bold text-white">Cấy Ghép Chip &amp; Seal IP68</h5>
              <p className="text-xs text-slate-300 leading-relaxed font-light">
                Cấy ghép vi mạch NTAG215 và lớp màng Ferrite chống nhiễu, bao bọc bởi vòng đệm silicon đàn hồi cao chống nước tuyệt đối.
              </p>
            </div>

            <div className="p-6 rounded-2xl glass-panel border border-white/10 space-y-4 hover:bg-white/[0.05] transition-all">
              <span className="font-mono text-xs font-bold text-slate-400 bg-white/10 px-2.5 py-1 rounded-md">BƯỚC 04</span>
              <h5 className="font-serif text-lg font-bold text-white">Đánh Bóng &amp; Kiểm Tra RF</h5>
              <p className="text-xs text-slate-300 leading-relaxed font-light">
                Thợ kim hoàn lành nghề đánh bóng gương thủ công, khắc laser số serial độc bản và kiểm tra 100 lần quét NFC trước khi đóng hộp.
              </p>
            </div>
          </div>
        </section>

        {/* 5. BRAND TIMELINE & MILESTONES */}
        <section className="space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300 font-sans uppercase tracking-[0.2em]">
              <History className="w-3.5 h-3.5 text-slate-300" />
              <span>Hành Trình Kiến Tạo</span>
            </div>
            <h3 className="font-serif text-2xl sm:text-4xl font-normal text-white">
              Cột Mốc Phát Triển Của EMORIA
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            <div className="p-8 rounded-3xl glass-panel border border-white/10 relative space-y-4">
              <span className="font-serif text-3xl font-bold text-slate-500">2024</span>
              <h4 className="font-serif text-xl font-bold text-white">Khởi Nguồn Ý Tưởng</h4>
              <p className="text-xs sm:text-sm text-slate-300 font-light leading-relaxed">
                Đội ngũ sáng lập bắt đầu thử nghiệm đưa vi mạch cảm ứng vào vỏ trang sức bạc đầu tiên. Vượt qua hơn 50 lần thử nghiệm thất bại do nhiễu sóng kim loại.
              </p>
            </div>

            <div className="p-8 rounded-3xl glass-panel border border-amber-300/30 relative space-y-4 bg-white/[0.03]">
              <span className="font-serif text-3xl font-bold text-amber-300">2025</span>
              <h4 className="font-serif text-xl font-bold text-white">Đột Phá Vi Mạch Ferrite</h4>
              <p className="text-xs sm:text-sm text-slate-300 font-light leading-relaxed">
                Hoàn thiện công nghệ màng cách từ độc quyền, thử nghiệm thành công 10,000 lượt chạm mượt mà trên tất cả dòng máy iPhone và Android không cần app.
              </p>
            </div>

            <div className="p-8 rounded-3xl glass-panel border border-white/10 relative space-y-4">
              <span className="font-serif text-3xl font-bold text-white">2026</span>
              <h4 className="font-serif text-xl font-bold text-white">Ra Mắt BST Toàn Diện</h4>
              <p className="text-xs sm:text-sm text-slate-300 font-light leading-relaxed">
                Chính thức trình làng bộ sưu tập EMORIA Lumen, Celestial và nền tảng Memory Cinema 2.0, phục vụ hàng ngàn khách hàng lưu giữ yêu thương độc bản.
              </p>
            </div>
          </div>
        </section>

        {/* 6. FOUR CORE VALUES */}
        <section className="space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <h3 className="font-serif text-2xl sm:text-4xl font-normal text-white">
              Bốn Giá Trị Cốt Lõi
            </h3>
            <p className="text-sm text-slate-300 font-light">
              Kim chỉ nam trong từng nét vẽ thiết kế và từng dòng mã của nền tảng EMORIA.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 sm:p-8 rounded-2xl glass-panel border border-white/10 flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0 text-white">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h5 className="font-serif text-lg font-bold text-white mb-1">Riêng Tư &amp; Bảo Mật Tuyệt Đối</h5>
                <p className="text-xs sm:text-sm text-slate-300 font-light leading-relaxed">
                  Chúng tôi coi trọng tính bất khả xâm phạm của kỷ niệm. Dữ liệu hình ảnh và thư tay được mã hóa riêng biệt, bạn có toàn quyền khóa PIN hoặc chia sẻ theo ý muốn.
                </p>
              </div>
            </div>

            <div className="p-6 sm:p-8 rounded-2xl glass-panel border border-white/10 flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0 text-white">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <h5 className="font-serif text-lg font-bold text-white mb-1">Vĩnh Cửu Với Thời Gian</h5>
                <p className="text-xs sm:text-sm text-slate-300 font-light leading-relaxed">
                  Không chạy theo xu hướng điện tử tiêu dùng nhanh vứt bỏ, sản phẩm EMORIA được thiết kế để tồn tại qua nhiều thập kỷ mà không lỗi thời.
                </p>
              </div>
            </div>

            <div className="p-6 sm:p-8 rounded-2xl glass-panel border border-white/10 flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0 text-white">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <h5 className="font-serif text-lg font-bold text-white mb-1">Chuẩn Mực Chế Tác Thượng Hạng</h5>
                <p className="text-xs sm:text-sm text-slate-300 font-light leading-relaxed">
                  Mỗi chi tiết viền ngàm, mối hàn laser và độ bóng gương đều tuân theo chuẩn mực kim hoàn thủ công cao cấp nhất của các xưởng kim hoàn hàng đầu.
                </p>
              </div>
            </div>

            <div className="p-6 sm:p-8 rounded-2xl glass-panel border border-white/10 flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0 text-white">
                <Gift className="w-6 h-6" />
              </div>
              <div>
                <h5 className="font-serif text-lg font-bold text-white mb-1">Cảm Xúc Làm Trọng Tâm</h5>
                <p className="text-xs sm:text-sm text-slate-300 font-light leading-relaxed">
                  Mục tiêu sau cùng của chúng tôi không phải là bán trang sức hay công nghệ, mà là giúp hai người yêu nhau có một nhịp cầu gắn kết chân thành và bất biến.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 7. ATELIER GUARANTEES & CUSTOMER PROMISES */}
        <section className="rounded-3xl glass-panel p-8 sm:p-12 border border-white/15 bg-gradient-to-br from-white/[0.03] to-transparent">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-4 max-w-xl text-center md:text-left">
              <span className="text-xs uppercase tracking-[0.25em] text-amber-300 font-bold">Cam Kết Từ Atelier</span>
              <h3 className="font-serif text-2xl sm:text-3xl font-bold text-white">
                Đặc Quyền Dành Riêng Cho Chủ Nhân EMORIA
              </h3>
              <p className="text-sm text-slate-300 font-light leading-relaxed">
                Mỗi tuyệt tác trang sức đều được gửi trao trong hộp quà nhung xanh đêm huyền bí, kèm thiệp thư tay tinh tế, chứng thư bảo hành và dịch vụ làm mới trang sức miễn phí trọn đời.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 w-full md:w-auto shrink-0">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                <ShieldCheck className="w-6 h-6 text-white mx-auto mb-2" />
                <p className="text-xs font-semibold text-white">Bảo Hành 1 Đổi 1</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Vi mạch NFC trong 12 tháng</p>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                <Sparkles className="w-6 h-6 text-amber-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-white">Làm Sáng Trọn Đời</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Vệ sinh &amp; đánh bóng bạc</p>
              </div>
            </div>
          </div>
        </section>

        {/* 8. CHÍNH SÁCH BẢO MẬT PHẦN CỨNG & QUYỀN RIÊNG TƯ KỶ NIỆM (BA PRIVACY POLICY) */}
        <section className="space-y-10">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/15 text-xs text-emerald-400 font-sans tracking-[0.2em] uppercase shadow-silver-glow">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>TIÊU CHUẨN AN TOÀN · BẢO MẬT DỮ LIỆU CÔNG NGHỆ EMORIA</span>
            </div>
            <h3 className="font-serif text-2xl sm:text-4xl font-normal text-white">
              Chính Sách Bảo Mật Không Gian Kỷ Niệm (Memory Space)
            </h3>
            <p className="text-sm text-slate-300 font-light leading-relaxed">
              Những kỷ niệm và tâm tư được lưu giữ trên trang sức EMORIA là tài sản tinh thần vô giá. Chúng tôi tuân thủ nghiêm ngặt 4 nguyên tắc bảo vệ dữ liệu theo tiêu chuẩn quốc tế:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 sm:p-8 rounded-3xl glass-panel border border-white/15 bg-white/[0.02] space-y-4 hover:border-emerald-400/30 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white">
                <Cpu className="w-6 h-6 text-amber-300" />
              </div>
              <h4 className="font-serif text-lg font-bold text-white">
                1. Chip NFC Là "Chìa Khóa Vật Lý" (Physical Key)
              </h4>
              <p className="text-xs sm:text-sm text-slate-300 font-light leading-relaxed">
                Chip NTAG21 trên trang sức chỉ đóng vai trò là "chìa khóa vật lý" dẫn đến liên kết bảo mật. <strong>Tuyệt đối không lưu trữ trực tiếp hình ảnh, video hay thông tin cá nhân trên phần cứng kim loại</strong>, hạn chế tối đa nguy cơ rò rỉ dữ liệu khi người dùng bị thất lạc trang sức.
              </p>
            </div>

            <div className="p-6 sm:p-8 rounded-3xl glass-panel border border-white/15 bg-white/[0.02] space-y-4 hover:border-emerald-400/30 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white">
                <Lock className="w-6 h-6 text-amber-300" />
              </div>
              <h4 className="font-serif text-lg font-bold text-white">
                2. Quyền Thiết Lập Mã PIN Kỷ Niệm (Private Access)
              </h4>
              <p className="text-xs sm:text-sm text-slate-300 font-light leading-relaxed">
                Người sở hữu có toàn quyền thiết lập mật mã (PIN code 4-6 số) kèm câu đố gợi ý tinh tế cho trang Memory Space. Khi chạm NFC, người nhận bắt buộc phải nhập đúng mã xác nhận mới có thể giải mã và xem toàn bộ bức thư tay cùng thước phim kỷ niệm.
              </p>
            </div>

            <div className="p-6 sm:p-8 rounded-3xl glass-panel border border-white/15 bg-white/[0.02] space-y-4 hover:border-emerald-400/30 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
              </div>
              <h4 className="font-serif text-lg font-bold text-white">
                3. Mã Hóa Đường Truyền Chuẩn SSL/TLS 256-bit
              </h4>
              <p className="text-xs sm:text-sm text-slate-300 font-light leading-relaxed">
                Mọi dữ liệu media (ảnh, video, bản ghi âm, văn bản thư tay) khi tải lên hệ thống lưu trữ đám mây của EMORIA đều được mã hóa bằng giao thức SSL/TLS chuẩn an ninh ngân hàng, đảm bảo tính bảo mật và toàn vẹn dữ liệu từ thiết bị đến máy chủ.
              </p>
            </div>

            <div className="p-6 sm:p-8 rounded-3xl glass-panel border border-white/15 bg-white/[0.02] space-y-4 hover:border-emerald-400/30 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white">
                <HeartHandshake className="w-6 h-6 text-emerald-400" />
              </div>
              <h4 className="font-serif text-lg font-bold text-white">
                4. Cam Kết Không Bán Dữ Liệu &amp; Quyền Được Xóa
              </h4>
              <p className="text-xs sm:text-sm text-slate-300 font-light leading-relaxed">
                EMORIA cam kết <strong>tuyệt đối không chia sẻ, bán hoặc chuyển giao</strong> thông tin cá nhân của Quý khách cho bên thứ ba vì mục đích thương mại. Quý khách có toàn quyền yêu cầu chỉnh sửa, ẩn hoặc xóa vĩnh viễn dữ liệu Memory Space của mình bất cứ lúc nào.
              </p>
            </div>
          </div>

          {/* Privacy Callout & Direct Trigger */}
          <div className="p-6 sm:p-8 rounded-3xl glass-panel border border-white/20 bg-gradient-to-r from-emerald-500/10 via-amber-500/5 to-transparent flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
            <div className="space-y-1 text-center sm:text-left">
              <p className="font-serif text-base sm:text-lg font-bold text-white flex items-center justify-center sm:justify-start gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span>Minh Bạch &amp; Bảo Vệ Quyền Riêng Tư Của Bạn</span>
              </p>
              <p className="text-xs text-slate-300 font-light">
                Chính sách bảo mật thông tin có hiệu lực chính thức trên website <strong>emoria.vn</strong> và qua email hỗ trợ <strong>emoria.jewelry@gmail.com</strong>.
              </p>
            </div>

            {onOpenPrivacy && (
              <button
                type="button"
                onClick={onOpenPrivacy}
                className="cta-luxury-gold !py-2.5 !px-5 !text-xs !tracking-wider flex items-center gap-2 shrink-0 cursor-pointer whitespace-nowrap shadow-[0_0_20px_rgba(250,204,21,0.4)]"
              >
                <span>Xem Toàn Văn Chính Sách</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </section>

        {/* 8. BOUTIQUE SHOWROOMS & GOOGLE MAPS LOCATION */}
        <section id="boutique-contact" className="space-y-12">
          {/* Section Header */}
          <div className="text-center space-y-4 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/15 text-xs text-amber-300 font-sans tracking-[0.22em] uppercase shadow-silver-glow">
              <Building2 className="w-3.5 h-3.5" />
              <span>HỆ THỐNG ATELIER BOUTIQUE · KHÔNG GIAN TRẢI NGHIỆM THỰC TẾ</span>
            </div>
            
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-normal text-white tracking-wide leading-tight">
              Gặp Gỡ EMORIA Tại <span className="italic text-metallic">Không Gian Atelier</span>
            </h2>
            
            <p className="font-sans text-sm sm:text-base text-slate-300 font-light leading-relaxed">
              Kính mời Quý khách ghé thăm các boutique chính thức để trực tiếp cảm nhận chất bạc Ý S925 đúc khối nguyên bản, thử nghiệm công nghệ một chạm NFC với chuyên viên và nhận dịch vụ khắc kỷ niệm riêng biệt tại chỗ.
            </p>
          </div>

          {/* Boutique Cards & Google Map Interactive Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            
            {/* Left Column: 2 Boutiques Information (5 cols) */}
            <div className="lg:col-span-5 space-y-6 flex flex-col justify-between">
              
              {/* Flagship Hanoi */}
              <motion.div 
                whileHover={{ y: -3 }}
                transition={{ duration: 0.25 }}
                className="p-6 sm:p-7 rounded-3xl glass-panel border border-amber-300/40 bg-gradient-to-br from-amber-400/[0.04] to-transparent shadow-glass relative overflow-hidden"
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="px-2.5 py-1 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 text-[10px] font-sans font-bold uppercase tracking-wider">
                    FLAGSHIP ATELIER · HÀ NỘI
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Đang mở cửa
                  </span>
                </div>

                <h4 className="font-serif text-xl font-bold text-white mb-3">
                  Boutique Tràng Tiền - Hoàn Kiếm
                </h4>

                <div className="space-y-3 text-xs sm:text-sm text-slate-300 font-light">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                    <span>Tầng 2, 28 Tràng Tiền, Phường Tràng Tiền, Quận Hoàn Kiếm, Hà Nội (Cạnh Nhà Hát Lớn)</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>09:00 - 21:30 (Mở cửa tất cả các ngày trong tuần)</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>Hotline đón tiếp: <strong className="text-white font-medium">0988 123 456</strong> · <strong className="text-white font-medium">1900 6868</strong></span>
                  </div>

                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>Email bespoke: <strong className="text-slate-200">bespoke.hanoi@emoria.vn</strong></span>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="mt-5 pt-4 border-t border-white/10 flex items-center gap-3">
                  <a
                    href="https://www.google.com/maps/search/?api=1&query=28+Trang+Tien+Hoan+Kiem+Ha+Noi"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cta-luxury-gold !py-2.5 !px-4 !text-xs !tracking-wider flex-1 flex items-center justify-center gap-1.5 shadow-[0_0_20px_rgba(250,204,21,0.55)]"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Chỉ đường Maps</span>
                  </a>
                  <a
                    href="tel:0988123456"
                    className="cta-luxury-secondary !py-2.5 !px-4 !text-xs !tracking-wider flex items-center justify-center gap-1.5"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Gọi tư vấn</span>
                  </a>
                </div>
              </motion.div>

              {/* Boutique HCMC */}
              <motion.div 
                whileHover={{ y: -3 }}
                transition={{ duration: 0.25 }}
                className="p-6 sm:p-7 rounded-3xl glass-panel border border-white/15 bg-white/[0.02] shadow-glass relative overflow-hidden"
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-slate-200 text-[10px] font-sans font-bold uppercase tracking-wider">
                    LUXURY SALON · TP. HỒ CHÍ MINH
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Đang mở cửa
                  </span>
                </div>

                <h4 className="font-serif text-xl font-bold text-white mb-3">
                  Boutique Đồng Khởi - Quận 1
                </h4>

                <div className="space-y-3 text-xs sm:text-sm text-slate-300 font-light">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                    <span>158 Đồng Khởi, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>09:30 - 22:00 (Mở cửa tất cả các ngày trong tuần)</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>Hotline đón tiếp: <strong className="text-white font-medium">0988 654 321</strong></span>
                  </div>

                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>Email bespoke: <strong className="text-slate-200">bespoke.hcm@emoria.vn</strong></span>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="mt-5 pt-4 border-t border-white/10 flex items-center gap-3">
                  <a
                    href="https://www.google.com/maps/search/?api=1&query=158+Dong+Khoi+Ben+Nghe+Quan+1+Ho+Chi+Minh"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cta-luxury-secondary !py-2.5 !px-4 !text-xs !tracking-wider flex-1 flex items-center justify-center gap-1.5"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Chỉ đường Maps</span>
                  </a>
                  <a
                    href="tel:0988654321"
                    className="cta-luxury-secondary !py-2.5 !px-4 !text-xs !tracking-wider flex items-center justify-center gap-1.5"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Gọi tư vấn</span>
                  </a>
                </div>
              </motion.div>

              {/* Brand Central HQ / Customer Support Card */}
              <div className="p-5 rounded-3xl glass-panel border border-white/10 bg-white/[0.02] text-xs text-slate-300 space-y-2.5">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <span className="font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
                    <span>Kênh Hỗ Trợ &amp; Tiếp Nhận Toàn Quốc</span>
                  </span>
                  <span className="text-amber-300 font-mono text-[10px] font-semibold">EMORIA.VN</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-[11px]">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Email chính thức:</span>
                    <a href="mailto:emoria.jewelry@gmail.com" className="text-white hover:text-amber-300 font-medium underline mt-0.5 inline-block">
                      emoria.jewelry@gmail.com
                    </a>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Tổng đài hỗ trợ 24/7:</span>
                    <a href="tel:19006868" className="text-white hover:text-amber-300 font-medium mt-0.5 inline-block">
                      1900 6868 · 0988 123 456
                    </a>
                  </div>
                </div>
              </div>

            </div>

            {/* Right Column: Google Maps Interactive Embed & Live Compass Navigation (7 cols) */}
            <div className="lg:col-span-7 flex flex-col">
              <div className="relative w-full h-[400px] sm:h-[480px] lg:h-full min-h-[440px] rounded-3xl overflow-hidden glass-panel border border-white/20 shadow-2xl group flex flex-col">
                
                {/* Top Overlay Banner on Map */}
                <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-dark-950/85 backdrop-blur-md border border-white/15 shadow-xl">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm font-bold text-white font-sans">EMORIA Flagship Atelier</p>
                      <p className="text-[10px] sm:text-xs text-slate-300 font-light truncate">28 Tràng Tiền, Hoàn Kiếm, Hà Nội</p>
                    </div>
                  </div>

                  <a
                    href="https://www.google.com/maps/search/?api=1&query=28+Trang+Tien+Hoan+Kiem+Ha+Noi"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cta-luxury-primary !py-2 !px-3.5 !text-xs !tracking-wider flex items-center gap-1.5 shrink-0"
                    title="Mở toàn màn hình trên Google Maps"
                  >
                    <span>Mở Maps</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                {/* Google Maps iFrame */}
                <iframe
                  title="Bản đồ vị trí EMORIA Flagship Atelier Tràng Tiền Hà Nội"
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3724.1130635460835!2d105.85408437599986!3d21.028160487799274!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3135abec2d26f631%3A0xb304b79b940ebf30!2zMjggVHLDoG5nIFRnhbuBbiwgSMOgbmcgQsOgaSwgSG_DoG4gS2nhur9tLCBIw6AgTuG7mWksIFZp4buHdCBOYW0!5e0!3m2!1svi!2s!4v1710900000000!5m2!1svi!2s"
                  className="w-full h-full border-0 filter grayscale-[20%] contrast-[105%] invert-[90%] hue-rotate-[180deg]"
                  style={{ minHeight: '400px' }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />

                {/* Bottom Overlay Info Strip */}
                <div className="absolute bottom-4 left-4 right-4 z-10 flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-dark-950/90 backdrop-blur-md border border-white/15">
                  <div className="flex items-center gap-4 text-xs text-slate-300 font-light">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      Khắc laser lấy ngay 15p
                    </span>
                    <span className="hidden sm:inline text-slate-600">✦</span>
                    <span className="hidden sm:inline">Trà bánh đón tiếp riêng</span>
                    <span className="hidden sm:inline text-slate-600">✦</span>
                    <span className="hidden sm:inline">Đỗ xe ô tô miễn phí</span>
                  </div>

                  <a
                    href="https://www.google.com/maps/dir/?api=1&destination=28+Trang+Tien+Hoan+Kiem+Ha+Noi"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cta-luxury-gold !py-2.5 !px-5 !text-xs !tracking-wider flex items-center gap-2 shadow-[0_0_25px_rgba(250,204,21,0.65)]"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Chỉ đường tới Atelier</span>
                  </a>
                </div>

              </div>
            </div>

          </div>

          {/* Concierge Hotline Strip */}
          <div className="p-6 sm:p-8 rounded-3xl glass-panel border border-white/15 bg-gradient-to-r from-white/[0.04] via-amber-400/[0.03] to-white/[0.04] flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
            <div className="space-y-1">
              <h4 className="font-serif text-lg sm:text-xl font-bold text-white flex items-center justify-center sm:justify-start gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-300" />
                <span>Dịch Vụ Concierge &amp; Hẹn Giờ Riêng Tư</span>
              </h4>
              <p className="text-xs sm:text-sm text-slate-300 font-light">
                Quý khách mong muốn một không gian riêng biệt để cùng người thương lựa chọn và cá nhân hóa kỷ vật?
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <a
                href="tel:19006868"
                className="cta-luxury-gold !py-3 !px-6 !text-xs sm:!text-sm flex items-center gap-2 shadow-[0_0_25px_rgba(250,204,21,0.55)]"
              >
                <Phone className="w-4 h-4" />
                <span>Hotline 1900 6868</span>
              </a>
              <button
                onClick={onNavigateToShop}
                className="cta-luxury-secondary !py-3 !px-6 !text-xs sm:!text-sm"
              >
                <span>Xem Cửa Hàng</span>
              </button>
            </div>
          </div>
        </section>

        {/* 9. GRAND CALL TO ACTION BANNER */}
        <section className="text-center py-12 border-t border-white/10 space-y-6">
          <h3 className="font-serif text-3xl sm:text-5xl font-normal text-white leading-tight">
            Hãy Để Kỷ Niệm Của Bạn <span className="italic text-metallic">Tỏa Sáng Vĩnh Cửu</span>
          </h3>
          <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto font-light leading-relaxed">
            Chọn một tạo tác từ bộ sưu tập của chúng tôi và bắt đầu kiến tạo Memory Space đặc quyền dành riêng cho người bạn yêu thương ngay hôm nay.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <button
              onClick={onNavigateToShop}
              className="cta-luxury-gold !px-8 !py-4 !text-sm shadow-[0_0_35px_rgba(250,204,21,0.65)]"
            >
              <span>Khám Phá Toàn Bộ Cửa Hàng</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={onNavigateToMemory}
              className="cta-luxury-secondary !px-8 !py-4 !text-sm"
            >
              <span>Xem Không Gian Kỷ Niệm</span>
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}
