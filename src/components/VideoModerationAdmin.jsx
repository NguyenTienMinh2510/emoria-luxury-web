import {useLanguage} from '../i18n/LanguageProvider';
import React, {useEffect, useState, useMemo} from 'react';
import {motion, AnimatePresence} from 'framer-motion';
import {
  ChevronDown,
  Clock,
  Film,
  Image as ImageIcon,
  CheckCircle2,
  ShieldAlert,
  AlertTriangle,
  Loader2,
  Layers,
  RefreshCw,
  FolderOpen,
  Sparkles
} from 'lucide-react';
import {apiRequest} from '../services/apiClient.js';
import {VIOLATION_LABELS} from '../services/videoLabels.js';

const statusLabels = {
  uploaded: 'Đã tải · chờ kiểm duyệt',
  processing: 'Đang kiểm duyệt',
  ready: 'Được chấp nhận',
  rejected: 'Bị từ chối',
  failed: 'Lỗi kỹ thuật'
};

/**
 * Clusters an array of upload/moderation events for a single user into time-based sessions.
 * Consecutive events occurring within `windowMinutes` (e.g. 15 mins) are grouped together.
 */
function clusterIntoTimeSessions(events, windowMinutes = 15) {
  if (!events || events.length === 0) return [];
  const windowMs = windowMinutes * 60 * 1000;

  // Sort descending by created_at (newest first)
  const sorted = [...events].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const sessions = [];
  let currentBatch = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevTime = new Date(prev.created_at).getTime();
    const currTime = new Date(curr.created_at).getTime();
    const timeDiff = Math.abs(prevTime - currTime);

    if (timeDiff <= windowMs) {
      currentBatch.push(curr);
    } else {
      sessions.push(summarizeSession(currentBatch));
      currentBatch = [curr];
    }
  }

  if (currentBatch.length > 0) {
    sessions.push(summarizeSession(currentBatch));
  }

  return sessions;
}

function summarizeSession(batch) {
  // batch is sorted newest to oldest
  const latestEvent = batch[0];
  const oldestEvent = batch[batch.length - 1];
  const startTime = new Date(oldestEvent.created_at).getTime();
  const endTime = new Date(latestEvent.created_at).getTime();
  const durationMs = Math.max(0, endTime - startTime);
  const durationMinutes = Math.round(durationMs / 60000);

  const uniquePaths = new Set(batch.map(e => e.path));
  const readyCount = batch.filter(e => e.status === 'ready').length;
  const rejectedCount = batch.filter(e => e.status === 'rejected').length;
  const processingCount = batch.filter(e => ['uploaded', 'processing'].includes(e.status)).length;
  const failedCount = batch.filter(e => e.status === 'failed').length;

  return {
    id: `session_${latestEvent.id}_${batch.length}_${endTime}`,
    latestEvent,
    oldestEvent,
    events: batch,
    count: batch.length,
    fileCount: uniquePaths.size,
    durationMinutes,
    readyCount,
    rejectedCount,
    processingCount,
    failedCount,
    tag: latestEvent.tag,
    author_name: latestEvent.author_name,
    user_id: latestEvent.user_id,
  };
}

export default function VideoModerationAdmin() {
  const {t, locale} = useLanguage();
  const statuses = Object.fromEntries(
    Object.entries(statusLabels).map(([key, label]) => [
      key,
      t(label, {
        uploaded: 'Uploaded · awaiting review',
        processing: 'Analyzing',
        ready: 'Approved',
        rejected: 'Rejected',
        failed: 'Technical error'
      }[key])
    ])
  );

  const [history, setHistory] = useState(false);
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [account, setAccount] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [category, setCategory] = useState(''); // '' | 'intro' | 'gallery'
  const [mediaType, setMediaType] = useState(''); // '' | 'video' | 'image'

  // Time window for grouping consecutive events (in minutes)
  const [sessionWindow, setSessionWindow] = useState(15);
  // Set of session IDs that are currently expanded
  const [expandedSessions, setExpandedSessions] = useState(new Set());
  const [actionBusy, setActionBusy] = useState('');
  const [overrideMsg, setOverrideMsg] = useState('');

  useEffect(() => {
    let active = true;
    setBusy(true);
    setError('');
    const params = {status, page, search, user: account, history};
    if (category) params.category = category;
    if (mediaType) params.media_type = mediaType;

    apiRequest('/admin/video-uploads?' + new URLSearchParams(params))
      .then(data => {
        if (active) setRows(data || []);
      })
      .catch(e => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [status, page, search, account, category, mediaType, history, refresh]);

  // Refresh while the current summary contains unfinished work
  useEffect(() => {
    if (history || !rows.some(row => ['uploaded', 'processing'].includes(row.status))) return;
    const timer = setInterval(() => setRefresh(n => n + 1), 15000);
    return () => clearInterval(timer);
  }, [history, rows]);

  // Group rows by user
  const userGroups = useMemo(() => {
    return rows.reduce((all, row) => {
      const key = row.user_id || 'deleted';
      (all[key] ??= []).push(row);
      return all;
    }, {});
  }, [rows]);

  // For each user, cluster their rows into time-proximity sessions
  const clusteredGroups = useMemo(() => {
    const result = {};
    for (const [userId, userRows] of Object.entries(userGroups)) {
      result[userId] = clusterIntoTimeSessions(userRows, sessionWindow);
    }
    return result;
  }, [userGroups, sessionWindow]);

  // All session IDs on the current page
  const allSessionIds = useMemo(() => {
    const ids = [];
    for (const sessions of Object.values(clusteredGroups)) {
      for (const s of sessions) {
        ids.push(s.id);
      }
    }
    return ids;
  }, [clusteredGroups]);

  const toggleSession = sessionId => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const expandAll = () => setExpandedSessions(new Set(allSessionIds));
  const collapseAll = () => setExpandedSessions(new Set());

  const inspectAccount = id => {
    setAccount(id);
    setSearch('');
    setDraft('');
    setStatus('');
    setPage(0);
  };

  const handleOverrideMedia = async row => {
    const mediaPath=row.path;
    if (!mediaPath) return;
    const confirmed = window.confirm(
      t(
        `Phê duyệt đặc cách cho tệp này?\n${mediaPath}\nTrạng thái sẽ được chuyển thành Được chấp thuận (ready).`,
        `Manually approve this media?\n${mediaPath}\nStatus will be changed to Approved (ready).`
      )
    );
    if (!confirmed) return;
    const reason=window.prompt(t('Lý do duyệt thủ công (10–500 ký tự):','Manual review reason (10–500 characters):'))?.trim();
    if(!reason||reason.length<10||reason.length>500)return;

    setActionBusy(mediaPath);
    setOverrideMsg('');
    try {
      await apiRequest('/admin/video-uploads/override', {
        method: 'POST',
        body: {path: mediaPath, requestId: row.request_id, reason}
      });
      setOverrideMsg(t(`Đã duyệt đặc cách thành công cho tệp: ${mediaPath}`, `Successfully approved: ${mediaPath}`));
      setTimeout(() => setOverrideMsg(''), 4000);
      setRefresh(n => n + 1);
    } catch (err) {
      alert(err.message || t('Lỗi khi duyệt đặc cách.', 'Failed to approve media.'));
    } finally {
      setActionBusy('');
    }
  };

  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-serif text-2xl text-white">{t("Kiểm duyệt phương tiện tải lên", "Media moderation")}</h2>
        <p className="text-sm text-slate-400 mt-1">
          {t("Nhật ký kiểm duyệt AI cho cả Video và Hình ảnh. Tách bạch rõ ràng giữa", "AI moderation for videos and images, organized into")}{' '}
          <strong>{t("Video đại diện mở thư", "Opening video")}</strong> {t("và", "and")}{' '}
          <strong>{t("Media bộ sưu tập (Gallery)", "Gallery media")}</strong>.
        </p>
      </div>

      {/* Tìm kiếm tài khoản hoặc kỷ vật */}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={event => {
          event.preventDefault();
          setSearch(draft.trim());
          setAccount('');
          setPage(0);
        }}
      >
        <label className="store-label flex-1 min-w-0">
          {t("Tìm tài khoản hoặc kỷ vật", "Search accounts or memories")}
          <input
            className="store-input w-full"
            type="search"
            maxLength={120}
            placeholder={t("User ID, tên tác giả hoặc mã kỷ vật", "User ID, author name or memory ID")}
            value={draft}
            onChange={event => setDraft(event.target.value)}
          />
        </label>
        <button className="store-button" type="submit">
          {t("Tìm kiếm", "Search")}
        </button>
      </form>

      {account && (
        <div className="text-sm break-all space-y-2 p-3 rounded-xl bg-white/5 border border-white/10">
          <p>
            {t("Đang xem toàn bộ lịch sử của tài khoản:", "Viewing uploads for account:")}{' '}
            <span className="font-mono text-amber-300">{account}</span>
          </p>
          <button
            className="store-button"
            onClick={() => {
              setAccount('');
              setPage(0);
            }}
          >
            {t("Bỏ lọc tài khoản", "Clear account filter")}
          </button>
        </div>
      )}

      {/* Bộ lọc phân loại danh mục */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
        <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          {t("Bộ lọc phân loại & trạng thái", "Category & status filters")}
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Filter theo Category */}
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition ${
              category === '' ? 'bg-white text-dark-950 font-bold' : 'bg-black/40 text-slate-300 hover:bg-white/10'
            }`}
            onClick={() => {
              setCategory('');
              setPage(0);
            }}
          >
            {t("Tất cả vị trí", "All locations")}
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition ${
              category === 'intro' ? 'bg-amber-400 text-black font-bold' : 'bg-black/40 text-amber-300 hover:bg-white/10'
            }`}
            onClick={() => {
              setCategory('intro');
              setPage(0);
            }}
          >
            {t("Video đại diện", "Opening video")}
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition ${
              category === 'gallery' ? 'bg-sky-400 text-black font-bold' : 'bg-black/40 text-sky-300 hover:bg-white/10'
            }`}
            onClick={() => {
              setCategory('gallery');
              setPage(0);
            }}
          >
            {t("Bộ sưu tập Kỷ niệm", "Memory gallery")}
          </button>

          <span className="border-r border-white/20 mx-1 hidden sm:inline" />

          {/* Filter theo Loại Media (Video vs Image) */}
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition ${
              mediaType === '' ? 'bg-white/20 text-white' : 'bg-black/40 text-slate-400 hover:bg-white/10'
            }`}
            onClick={() => {
              setMediaType('');
              setPage(0);
            }}
          >
            {t("Mọi định dạng", "All formats")}
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition ${
              mediaType === 'video' ? 'bg-indigo-400 text-black font-bold' : 'bg-black/40 text-indigo-300 hover:bg-white/10'
            }`}
            onClick={() => {
              setMediaType('video');
              setPage(0);
            }}
          >
            {t("Chỉ Video", "Videos only")}
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition ${
              mediaType === 'image' ? 'bg-emerald-400 text-black font-bold' : 'bg-black/40 text-emerald-300 hover:bg-white/10'
            }`}
            onClick={() => {
              setMediaType('image');
              setPage(0);
            }}
          >
            {t("Chỉ Hình ảnh", "Images only")}
          </button>
        </div>

        <div className="flex flex-wrap gap-3 items-center pt-2 border-t border-white/10">
          <label className="store-label !mb-0 flex items-center gap-2">
            <span>{t("Trạng thái kiểm duyệt:", "Moderation status:")}</span>
            <select
              className="store-input text-xs py-1"
              value={status}
              disabled={busy}
              onChange={e => {
                setStatus(e.target.value);
                setPage(0);
              }}
            >
              <option value="">{t("Tất cả trạng thái", "All statuses")}</option>
              {Object.entries(statuses).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          {/* Thiết lập khoảng thời gian nhóm phiên */}
          <label className="store-label !mb-0 flex items-center gap-2 ml-auto sm:ml-0">
            <span>{t("Khoảng cách gộp đợt:", "Session grouping:")}</span>
            <select
              className="store-input text-xs py-1"
              value={sessionWindow}
              onChange={e => setSessionWindow(Number(e.target.value))}
            >
              <option value={5}>5 {t("phút", "mins")}</option>
              <option value={15}>15 {t("phút", "mins")}</option>
              <option value={30}>30 {t("phút", "mins")}</option>
              <option value={60}>1 {t("giờ", "hour")}</option>
            </select>
          </label>

          <button
            type="button"
            className="store-button ml-auto"
            disabled={busy}
            onClick={() => setRefresh(value => value + 1)}
          >
            <RefreshCw className="w-3.5 h-3.5 inline mr-1" />
            {t("Làm mới", "Refresh")}
          </button>
        </div>
      </div>

      {/* Tùy chọn chi tiết sự kiện & Điều khiển mở rộng hàng loạt */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-black/40 border border-white/10">
        <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={history}
            onChange={e => {
              setHistory(e.target.checked);
              setPage(0);
            }}
          />
          <span>{t('Xem từng sự kiện (bao gồm các bước trung gian)', 'Show individual events (including intermediate steps)')}</span>
        </label>

        {allSessionIds.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={expandAll}
              className="px-2.5 py-1 rounded-lg text-xs bg-white/10 hover:bg-white/20 text-slate-200 transition cursor-pointer"
            >
              {t("Mở rộng tất cả", "Expand all")}
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="px-2.5 py-1 rounded-lg text-xs bg-white/10 hover:bg-white/20 text-slate-200 transition cursor-pointer"
            >
              {t("Thu gọn tất cả", "Collapse all")}
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400">
        {t(
          'Mặc định các hoạt động tải và kiểm duyệt của cùng 1 người dùng trong khoảng thời gian gần nhau được gộp thành một đợt và hiển thị kết quả cuối cùng. Bấm vào kí hiệu mở rộng để xem toàn bộ lịch sử chi tiết.',
          'Uploads and moderation activities by the same user within close timeframe are clustered together showing the final outcome. Click the expand symbol to view the entire breakdown dropdown.'
        )}
      </p>

      {overrideMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{overrideMsg}</span>
        </div>
      )}

      {error && <p role="alert" className="text-red-300 text-xs">{error}</p>}
      {busy && <p role="status" className="text-xs text-amber-200">{t("Đang tải nhật ký kiểm duyệt...", "Loading moderation log...")}</p>}
      {!busy && !rows.length && (
        <div className="p-8 text-center rounded-xl bg-white/5 border border-white/10 text-slate-400 text-sm">
          {t("Chưa có lượt tải nào phù hợp với bộ lọc hiện tại.", "No uploads match the current filters.")}
        </div>
      )}

      {/* Danh sách các phiên kiểm duyệt phân nhóm theo tài khoản */}
      {Object.entries(clusteredGroups).map(([userId, sessions]) => {
        const firstRow = sessions[0]?.latestEvent;
        const authorDisplay = firstRow?.author_name || t('Tài khoản đã xóa', 'Deleted account');
        const totalEventsCount = sessions.reduce((acc, s) => acc + s.count, 0);

        return (
          <section key={userId} className="space-y-4 min-w-0">
            {/* Tiêu đề nhóm tài khoản */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/15 pb-2">
              <h3 className="font-semibold text-white break-all flex items-center gap-2">
                <span>{authorDisplay}</span>
                <span className="text-xs font-normal text-slate-400 font-mono">
                  ({sessions.length} {t('đợt kiểm duyệt', 'sessions')} · {totalEventsCount} {history ? t('sự kiện', 'events') : t('tệp', 'files')})
                </span>
              </h3>
              {userId !== 'deleted' && account !== userId && (
                <button className="store-button text-xs" onClick={() => inspectAccount(userId)}>
                  {t("Xem toàn bộ lịch sử tài khoản", "View this account’s uploads")}
                </button>
              )}
            </div>

            {/* Danh sách các đợt/phiên kiểm duyệt */}
            <div className="space-y-3.5">
              {sessions.map(session => {
                const isExpanded = expandedSessions.has(session.id);
                const final = session.latestEvent;
                const isIntroVideo = final.category === 'intro';
                const isPhoto = final.media_type === 'image';

                // Trạng thái cuối cùng của đợt này
                const isApproved = final.status === 'ready';
                const isRejected = final.status === 'rejected';
                const isProcessing = ['uploaded', 'processing'].includes(final.status);

                return (
                  <article
                    key={session.id}
                    className="rounded-2xl border border-white/15 bg-black/50 overflow-hidden shadow-lg transition-all hover:border-amber-400/30"
                  >
                    {/* Phần chính: KẾT QUẢ CUỐI CÙNG của đợt tải */}
                    <div className="p-4 sm:p-5 space-y-3">
                      {/* Dòng 1: Tác giả, Badge phân loại và HUY HIỆU KẾT QUẢ CUỐI CÙNG */}
                      <div className="flex flex-wrap items-center justify-between gap-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-white text-base font-serif">{session.author_name}</strong>

                          {/* Kỷ vật Tag */}
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-white/10 text-amber-300 border border-white/15">
                            #{final.tag}
                          </span>

                          {/* Phân loại Video đại diện vs Gallery */}
                          {isIntroVideo ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-400/15 border border-amber-400/35 text-amber-300 flex items-center gap-1">
                              <Film className="w-3 h-3" />
                              <span>{t("Video đại diện", "Opening video")}</span>
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/15 border border-sky-500/35 text-sky-300 flex items-center gap-1">
                              <FolderOpen className="w-3 h-3" />
                              <span>{t("Bộ sưu tập", "Gallery")}</span>
                            </span>
                          )}

                          {/* Loại file */}
                          <span className="px-2 py-0.5 rounded text-[10px] bg-white/10 text-slate-300 font-mono flex items-center gap-1">
                            {isPhoto ? <ImageIcon className="w-3 h-3" /> : <Film className="w-3 h-3" />}
                            <span>{isPhoto ? t("Ảnh", "Image") : 'Video'}</span>
                          </span>

                          {/* Huy hiệu đợt tải nhiều hoạt động */}
                          {session.count > 1 && (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
                              {session.count} {t("hoạt động gần nhau", "clustered events")}
                            </span>
                          )}
                        </div>

                        {/* Huy hiệu KẾT QUẢ CUỐI CÙNG (Final Outcome Badge) */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-sm ${
                              isRejected
                                ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                                : isApproved
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : isProcessing
                                ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 animate-pulse'
                                : 'bg-slate-500/20 text-slate-300 border border-slate-500/40'
                            }`}
                          >
                            {isRejected && <ShieldAlert className="w-3.5 h-3.5 text-red-400" />}
                            {isApproved && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                            {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />}
                            <span>
                              {t("Kết quả cuối:", "Final outcome:")} {statuses[final.status] || final.status}
                            </span>
                          </span>

                          {(final.status === 'failed') && (
                            <button
                              type="button"
                              onClick={() => handleOverrideMedia(final)}
                              disabled={actionBusy === final.path}
                              className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 cursor-pointer transition shadow-sm"
                            >
                              {actionBusy === final.path ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              )}
                              <span>{t("Duyệt đặc cách", "Manual approve")}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Dòng 2: Thông tin thời gian và tệp kết quả cuối */}
                      <div className="text-xs text-slate-400 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="flex items-center gap-1 text-slate-300">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{new Date(final.created_at).toLocaleString(locale)}</span>
                          </span>

                          {session.count > 1 && (
                            <span className="text-slate-400">
                              (
                              {t(
                                'Đợt tải gồm {count} hoạt động diễn ra trong {mins}',
                                'Batch of {count} events across {mins}',
                                {
                                  count: session.count,
                                  mins:
                                    session.durationMinutes > 0
                                      ? `${session.durationMinutes} ${t('phút', 'mins')}`
                                      : t('dưới 1 phút', '< 1 min')
                                }
                              )}
                              )
                            </span>
                          )}

                          {session.count > 1 && (
                            <div className="flex items-center gap-2 text-[11px] font-mono">
                              {session.readyCount > 0 && (
                                <span className="text-emerald-400 font-semibold">✓ {session.readyCount} {t("duyệt", "approved")}</span>
                              )}
                              {session.rejectedCount > 0 && (
                                <span className="text-red-400 font-semibold">✗ {session.rejectedCount} {t("từ chối", "rejected")}</span>
                              )}
                              {session.processingCount > 0 && (
                                <span className="text-amber-400 font-semibold">⏳ {session.processingCount} {t("chờ xử lý", "pending")}</span>
                              )}
                            </div>
                          )}
                        </div>

                        <p className="font-mono text-slate-500 break-all">
                          {t("Tệp kết quả cuối:", "Final file:")}{' '}
                          <span className="text-slate-300">{final.path}</span>
                        </p>
                      </div>

                      {/* Dòng 3: Nhãn chủ đề AI (AI Topic Labels) của kết quả cuối */}
                      <div className="pt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="text-slate-400">{t("Nhãn chủ đề:", "Topic labels:")}</span>
                        {final.labels && final.labels.length > 0 ? (
                          <span className="text-amber-200 font-medium">
                            {final.labels.map(l => `#${l}`).join('  ')}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">{t("Chưa có nhãn", "No labels yet")}</span>
                        )}
                      </div>

                      {/* Dòng 4: Nhãn vi phạm & lý do nếu có */}
                      {(final.violations?.length > 0 || final.reason) && (
                        <div className="p-2.5 rounded-xl bg-red-950/20 border border-red-500/25 space-y-1 text-xs">
                          {final.violations?.length > 0 && (
                            <p className="text-red-300 font-medium flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                              <span>
                                {t("Nhãn vi phạm:", "Violations:")}{' '}
                                {final.violations.map(v => VIOLATION_LABELS[v] || v).join(' · ')}
                              </span>
                            </p>
                          )}
                          {final.reason && (
                            <p className="text-amber-200/90 pl-5">
                              {final.reason}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Thông số Model */}
                      <p className="text-[11px] text-slate-500">
                        Model AI: {final.model} {t("· Chính sách:", "· Policy:")}{' '}
                        {final.policy_version === 0
                          ? t("Chưa kiểm duyệt theo chính sách mới", "Not reviewed under the current policy")
                          : `v${final.policy_version}`}
                      </p>
                    </div>

                    {/* KÍ HIỆU MỞ RỘNG (Dropdown Toggle): Nếu có nhiều hơn 1 hoạt động trong đợt này */}
                    {session.count > 1 ? (
                      <div className="border-t border-white/10 bg-white/[0.02]">
                        <button
                          type="button"
                          onClick={() => toggleSession(session.id)}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.05] transition-colors cursor-pointer group text-xs text-amber-300 font-medium select-none"
                        >
                          <div className="flex items-center gap-2">
                            {/* Kí hiệu mở rộng Chevron */}
                            <div className="w-5 h-5 rounded-md bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300 group-hover:scale-110 transition-transform">
                              <ChevronDown
                                className={`w-3.5 h-3.5 transition-transform duration-300 ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            </div>
                            <span>
                              {isExpanded
                                ? t("Thu gọn nhật ký chi tiết đợt này", "Collapse detailed session history")
                                : t(
                                    "Mở rộng {count} hoạt động đăng video trong đợt này ({duration}) ▼",
                                    "Expand {count} activities during this upload burst ({duration}) ▼",
                                    {
                                      count: session.count,
                                      duration:
                                        session.durationMinutes > 0
                                          ? `${session.durationMinutes} ${t('phút', 'mins')}`
                                          : t('gần như đồng thời', 'simultaneous')
                                    }
                                  )}
                            </span>
                          </div>

                          <span className="text-[11px] text-slate-400 font-mono group-hover:text-amber-200 transition-colors">
                            {isExpanded ? t("Đang mở ▼", "Expanded ▼") : t("Xem chi tiết dòng thời gian ▶", "View timeline ▶")}
                          </span>
                        </button>

                        {/* PHẦN DROPDOWN MỞ RỘNG: Dòng thời gian chi tiết từng hoạt động */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.25, ease: 'easeInOut' }}
                              className="overflow-hidden border-t border-white/10 bg-dark-950/70 p-4 sm:p-5 space-y-3"
                            >
                              <div className="flex items-center justify-between text-xs text-slate-300 font-semibold pb-1 border-b border-white/10">
                                <span className="flex items-center gap-1.5 font-serif text-amber-200">
                                  <Layers className="w-3.5 h-3.5 text-amber-300" />
                                  <span>
                                    {t("Dòng thời gian hoạt động của user trong đợt này", "User activity timeline in this burst")}
                                  </span>
                                </span>
                                <span className="text-[11px] text-slate-400 font-mono">
                                  {t("Từ", "From")} {new Date(session.oldestEvent.created_at).toLocaleTimeString(locale)}{' '}
                                  {t("đến", "to")} {new Date(session.latestEvent.created_at).toLocaleTimeString(locale)}
                                </span>
                              </div>

                              {/* Danh sách từng bước hoạt động theo thứ tự thời gian */}
                              <div className="space-y-2.5">
                                {session.events.map((event, idx) => {
                                  const stepNumber = session.events.length - idx;
                                  const isLatest = idx === 0;
                                  const isEventApproved = event.status === 'ready';
                                  const isEventRejected = event.status === 'rejected';

                                  return (
                                    <div
                                      key={event.id || idx}
                                      className={`p-3 rounded-xl border transition-colors ${
                                        isLatest
                                          ? 'bg-amber-400/[0.04] border-amber-400/30'
                                          : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                                      } space-y-2 text-xs`}
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                          <span className="px-2 py-0.5 rounded-full font-mono text-[10px] font-bold bg-white/10 text-amber-300 border border-white/15">
                                            #{stepNumber} {isLatest ? `(${t("Mới nhất", "Latest")})` : ''}
                                          </span>

                                          <span className="text-slate-300 font-mono text-[11px]">
                                            {new Date(event.created_at).toLocaleTimeString(locale)}
                                          </span>

                                          <span className="px-2 py-0.2 rounded text-[10px] bg-white/5 text-slate-400">
                                            {event.category === 'intro' ? t("Video đại diện", "Intro") : t("Bộ sưu tập", "Gallery")}
                                          </span>

                                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-white/5 text-slate-400">
                                            {event.media_type === 'image' ? t("Ảnh", "Image") : 'Video'}
                                          </span>
                                        </div>

                                        <div className="flex items-center gap-2">
                                          <span
                                            className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                              isEventRejected
                                                ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                                : isEventApproved
                                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                : 'bg-amber-500/20 text-amber-200 border border-amber-500/30'
                                            }`}
                                          >
                                            {statuses[event.status] || event.status}
                                          </span>

                                          {(event.status === 'failed') && (
                                            <button
                                              type="button"
                                              onClick={() => handleOverrideMedia(event)}
                                              disabled={actionBusy === event.path}
                                              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 cursor-pointer transition"
                                            >
                                              {actionBusy === event.path ? (
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                              ) : (
                                                <CheckCircle2 className="w-3 h-3" />
                                              )}
                                              <span>{t("Duyệt đặc cách", "Force approve")}</span>
                                            </button>
                                          )}
                                        </div>
                                      </div>

                                      <p className="font-mono text-slate-400 break-all text-[11px]">
                                        {event.path}
                                      </p>

                                      {/* Nhãn chủ đề riêng của bước này */}
                                      {event.labels?.length > 0 && (
                                        <p className="text-amber-200/90 text-[11px]">
                                          {t("Nhãn:", "Labels:")} {event.labels.map(l => `#${l}`).join('  ')}
                                        </p>
                                      )}

                                      {/* Vi phạm riêng của bước này */}
                                      {event.violations?.length > 0 && (
                                        <p className="text-red-300 text-[11px] font-medium">
                                          {t("Vi phạm:", "Violations:")}{' '}
                                          {event.violations.map(v => VIOLATION_LABELS[v] || v).join(' · ')}
                                        </p>
                                      )}

                                      {event.reason && (
                                        <p className="text-xs text-amber-200/80 p-2 rounded bg-black/40 border border-white/10">
                                          {event.reason}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ) : (
                      // Nếu chỉ có 1 hoạt động duy nhất trong đợt này
                      session.latestEvent.event_count > 1 && (
                        <div className="border-t border-white/10 px-4 py-2 bg-white/[0.01] text-[11px] text-slate-400 flex items-center justify-between">
                          <span>
                            {t('{attempts} lượt phân tích · {events} sự kiện đã gộp trên máy chủ',
                               '{attempts} analysis attempts · {events} server events grouped',
                               {
                                 attempts: session.latestEvent.attempt_count,
                                 events: session.latestEvent.event_count
                               })}
                          </span>
                        </div>
                      )
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Phân trang */}
      <div className="flex gap-3 items-center justify-between pt-2">
        <button
          className="store-button"
          disabled={busy || page === 0}
          onClick={() => setPage(p => p - 1)}
        >
          {t("Trang trước", "Previous")}
        </button>
        <span className="text-xs text-slate-300">
          Trang {page + 1}
        </span>
        <button
          className="store-button"
          disabled={busy || rows.length < 25}
          onClick={() => setPage(p => p + 1)}
        >
          {t("Trang sau", "Next")}
        </button>
      </div>
    </section>
  );
}
