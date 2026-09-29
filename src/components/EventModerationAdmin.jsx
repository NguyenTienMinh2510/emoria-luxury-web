import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldAlert, CheckCircle2, AlertTriangle, Eye, EyeOff,
  RefreshCw, BarChart3, TrendingUp, Users, Heart, Share2,
  Download, Filter, Clock, Check, X, Sparkles
} from 'lucide-react';
import {
  adminListReports,
  adminModerateContent,
  adminGetAnalyticsSummary
} from '../services/eventService.js';

export default function EventModerationAdmin() {
  const [subTab, setSubTab] = useState('reports'); // 'reports' | 'analytics'
  const [reports, setReports] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [reportError, setReportError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [moderatingId, setModeratingId] = useState(null);

  // Analytics state
  const [days, setDays] = useState(30);
  const [analytics, setAnalytics] = useState(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  // Load content reports
  const fetchReports = useCallback(async () => {
    setIsLoadingReports(true);
    setReportError('');
    try {
      const data = await adminListReports(statusFilter || null, 50, 0);
      setReports(Array.isArray(data) ? data : []);
    } catch (err) {
      setReportError(err?.message || 'Không thể tải danh sách báo cáo vi phạm.');
    } finally {
      setIsLoadingReports(false);
    }
  }, [statusFilter]);

  // Load analytics
  const fetchAnalytics = useCallback(async () => {
    setIsLoadingAnalytics(true);
    try {
      const data = await adminGetAnalyticsSummary(days);
      setAnalytics(data);
    } catch (err) {
      console.warn('[Admin Analytics Error]', err?.message);
    } finally {
      setIsLoadingAnalytics(false);
    }
  }, [days]);

  useEffect(() => {
    if (subTab === 'reports') {
      fetchReports();
    } else {
      fetchAnalytics();
    }
  }, [subTab, fetchReports, fetchAnalytics]);

  // Handle moderation action
  const handleModerate = async (reportId, action, defaultReason = '') => {
    const reasonPrompt = action === 'hide'
      ? (window.prompt('Nhập lý do ẩn nội dung vi phạm:', defaultReason || 'Vi phạm tiêu chuẩn cộng đồng') || '').trim()
      : null;
    if (action === 'hide' && !reasonPrompt) return;

    setModeratingId(reportId);
    try {
      await adminModerateContent(reportId, action, reasonPrompt);
      setActionMessage(`Đã ${action === 'hide' ? 'ẩn' : action === 'restore' ? 'khôi phục' : 'bỏ qua'} nội dung thành công.`);
      setTimeout(() => setActionMessage(''), 3000);
      await fetchReports();
    } catch (err) {
      alert(err?.message || 'Lỗi khi xử lý kiểm duyệt.');
    } finally {
      setModeratingId(null);
    }
  };

  const getReasonLabel = (reason) => {
    const map = {
      inappropriate_content: 'Nội dung không phù hợp',
      harassment: 'Quấy rối / Đả kích',
      copyright: 'Vi phạm bản quyền',
      spam: 'Spam / Lạm dụng',
      other: 'Lý do khác'
    };
    return map[reason] || reason;
  };

  const getStatusBadge = (status) => {
    if (status === 'pending') {
      return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">Chờ xử lý</span>;
    }
    if (status === 'hidden') {
      return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">Đã ẩn</span>;
    }
    if (status === 'restored') {
      return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Đã khôi phục</span>;
    }
    return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/20 text-slate-300 border border-slate-500/30">Đã bỏ qua</span>;
  };

  return (
    <div className="space-y-6 text-slate-200">
      {/* Sub-tab Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('reports')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              subTab === 'reports'
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Hàng chờ báo cáo vi phạm</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('analytics')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              subTab === 'analytics'
                ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Thống kê & Phễu sự kiện</span>
          </button>
        </div>

        {subTab === 'reports' ? (
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-rose-400"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="pending">Chờ xử lý</option>
              <option value="hidden">Đã ẩn</option>
              <option value="restored">Đã khôi phục</option>
              <option value="dismissed">Đã bỏ qua</option>
            </select>
            <button
              type="button"
              onClick={fetchReports}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors cursor-pointer"
              title="Tải lại danh sách"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingReports ? 'animate-spin' : ''}`} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Khoảng thời gian:</span>
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  days === d
                    ? 'bg-white text-dark-950'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10'
                }`}
              >
                {d} ngày
              </button>
            ))}
          </div>
        )}
      </div>

      {actionMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 1: CONTENT REPORTS QUEUE                                      */}
      {/* ===================================================================== */}
      {subTab === 'reports' && (
        <div className="space-y-3">
          {reportError && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>{reportError}</span>
            </div>
          )}

          {isLoadingReports ? (
            <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-rose-400" />
              <span>Đang tải danh sách báo cáo...</span>
            </div>
          ) : reports.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs bg-white/[0.02] border border-white/5 rounded-2xl">
              Không có báo cáo nội dung nào trong hệ thống.
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                        [{report.resource_type}]
                      </span>
                      <span className="text-sm font-bold text-white">
                        {getReasonLabel(report.reason)}
                      </span>
                      {getStatusBadge(report.status)}
                    </div>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(report.created_at).toLocaleString('vi-VN')}
                    </span>
                  </div>

                  <div className="text-xs text-slate-300 space-y-1 bg-black/20 p-3 rounded-xl border border-white/5">
                    <div>
                      <span className="text-slate-500">Mã tài nguyên ({report.resource_type}): </span>
                      <span className="font-mono text-slate-300 select-all">{report.resource_id}</span>
                    </div>
                    {report.details && (
                      <div>
                        <span className="text-slate-500">Nội dung báo cáo chi tiết: </span>
                        <span className="italic text-slate-200">"{report.details}"</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-white/5">
                    {report.status !== 'hidden' && (
                      <button
                        type="button"
                        onClick={() => handleModerate(report.id, 'hide', report.reason)}
                        disabled={moderatingId === report.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Ẩn nội dung vi phạm</span>
                      </button>
                    )}

                    {report.status === 'hidden' && (
                      <button
                        type="button"
                        onClick={() => handleModerate(report.id, 'restore')}
                        disabled={moderatingId === report.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Khôi phục hiển thị</span>
                      </button>
                    )}

                    {report.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => handleModerate(report.id, 'dismiss')}
                        disabled={moderatingId === report.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Bỏ qua báo cáo</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 2: EVENT ANALYTICS & FUNNEL SUMMARY                           */}
      {/* ===================================================================== */}
      {subTab === 'analytics' && (
        <div className="space-y-6">
          {isLoadingAnalytics ? (
            <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
              <span>Đang tính toán phễu sự kiện...</span>
            </div>
          ) : !analytics ? (
            <div className="py-12 text-center text-slate-400 text-xs bg-white/[0.02] border border-white/5 rounded-2xl">
              Chưa có dữ liệu thống kê sự kiện.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Overview Metrics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                  <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
                    <span>Tổng số sự kiện</span>
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold font-serif text-white">
                    {analytics.total_events?.toLocaleString('vi-VN') || 0}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">Ghi nhận trong {days} ngày qua</div>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                  <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
                    <span>Match hoàn thành (cả hai)</span>
                    <Heart className="w-4 h-4 text-rose-400 fill-rose-500/20" />
                  </div>
                  <div className="text-2xl font-bold font-serif text-rose-300">
                    {analytics.funnel_match?.both_completed || 0}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">Cặp đôi cùng nộp bài</div>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                  <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
                    <span>Ngôi nhà đã xuất bản</span>
                    <Sparkles className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold font-serif text-amber-300">
                    {analytics.funnel_house?.published || 0}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">Kỷ niệm House 3D công khai</div>
                </div>
              </div>

              {/* Couple Match Funnel */}
              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Heart className="w-4 h-4 text-rose-400" />
                    <span>Phễu chuyển đổi: Couple Match Studio</span>
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">Funnel Steps</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                    <div className="text-[11px] text-slate-400">1. Mở link mời</div>
                    <div className="text-lg font-bold text-white mt-1">
                      {analytics.funnel_match?.invite_opened || 0}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                    <div className="text-[11px] text-slate-400">2. Bắt đầu trả lời</div>
                    <div className="text-lg font-bold text-white mt-1">
                      {analytics.funnel_match?.started || 0}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                    <div className="text-[11px] text-slate-400">3. Một bên hoàn thành</div>
                    <div className="text-lg font-bold text-white mt-1">
                      {(analytics.funnel_match?.owner_completed || 0) + (analytics.funnel_match?.partner_completed || 0)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30">
                    <div className="text-[11px] text-rose-300 font-semibold">4. Cả hai cùng nộp bài</div>
                    <div className="text-lg font-bold text-rose-400 mt-1">
                      {analytics.funnel_match?.both_completed || 0}
                    </div>
                  </div>
                </div>
              </div>

              {/* Memory House Funnel */}
              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>Phễu chuyển đổi: Memory House Studio</span>
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">Social & Visitors</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                    <div className="text-[11px] text-slate-400">1. Xuất bản nhà</div>
                    <div className="text-lg font-bold text-white mt-1">
                      {analytics.funnel_house?.published || 0}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                    <div className="text-[11px] text-slate-400">2. Khách mở xem</div>
                    <div className="text-lg font-bold text-white mt-1">
                      {analytics.funnel_house?.opened_share || 0}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                    <div className="text-[11px] text-slate-400">3. Click share / Copy link</div>
                    <div className="text-lg font-bold text-white mt-1">
                      {(analytics.funnel_house?.share_clicked || 0) + (analytics.funnel_house?.copy_link || 0)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                    <div className="text-[11px] text-amber-300 font-semibold">4. Tải/chia sẻ postcard</div>
                    <div className="text-lg font-bold text-amber-400 mt-1">
                      {(analytics.funnel_house?.postcard_download || 0) + (analytics.funnel_house?.postcard_shared || 0)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
