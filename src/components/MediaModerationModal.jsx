import React from 'react';

export default function MediaModerationModal({
  isOpen,
  title = "Đang tải lên & kiểm duyệt nội dung",
  detail = "Hệ thống đang kiểm tra nội dung và gắn nhãn chủ đề tự động. Quá trình xử lý thường chỉ mất vài giây, vui lòng giữ tab này mở..."
}) {
  if (!isOpen) return null;

  return (
    <div 
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div 
        className="w-full max-w-sm p-6 sm:p-7 rounded-3xl bg-neutral-950 border border-white/20 shadow-2xl text-center space-y-4 text-slate-100"
        onClick={e => e.stopPropagation()}
      >
        {/* Vòng xoay animation sang trọng */}
        <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-amber-400/20 animate-ping" />
          <div className="w-12 h-12 rounded-full border-2 border-amber-300/30 border-t-amber-400 animate-spin" />
        </div>

        <div className="space-y-1.5">
          <h4 className="font-serif text-lg text-white font-bold tracking-wide">
            {title}
          </h4>
          <p className="text-xs text-slate-300 leading-relaxed font-light">
            {detail}
          </p>
        </div>

        {/* Thanh trạng thái loading thanh lịch */}
        <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-amber-400 via-amber-200 to-amber-400 animate-pulse w-4/5 mx-auto rounded-full" />
        </div>

        <p className="text-[11px] text-slate-500 font-mono">
          Đang xử lý an toàn · Vui lòng không đóng cửa sổ
        </p>
      </div>
    </div>
  );
}
