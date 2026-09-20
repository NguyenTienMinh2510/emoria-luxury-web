import React, {useEffect, useState} from 'react';
import {apiRequest} from '../services/apiClient.js';
import {VIOLATION_LABELS} from '../services/videoLabels.js';

const statuses={
  uploaded:'Đã tải · chờ kiểm duyệt',
  processing:'Đang kiểm duyệt',
  ready:'Được chấp nhận',
  rejected:'Bị từ chối',
  failed:'Lỗi kỹ thuật'
};

export default function VideoModerationAdmin(){
  const [rows,setRows]=useState([]),[status,setStatus]=useState(''),[page,setPage]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [draft,setDraft]=useState(''),[search,setSearch]=useState(''),[account,setAccount]=useState(''),[refresh,setRefresh]=useState(0);
  const [category,setCategory]=useState(''); // '' | 'intro' | 'gallery'
  const [mediaType,setMediaType]=useState(''); // '' | 'video' | 'image'

  useEffect(()=>{
    let active=true;setBusy(true);setRows([]);setError('');
    const params={status,page,search,user:account};
    if(category)params.category=category;
    if(mediaType)params.media_type=mediaType;

    apiRequest('/admin/video-uploads?'+new URLSearchParams(params))
      .then(data=>{if(active)setRows(data);})
      .catch(e=>{if(active)setError(e.message);})
      .finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;};
  },[status,page,search,account,category,mediaType,refresh]);

  const groups=rows.reduce((all,row)=>{
    const key=row.user_id||'deleted';
    (all[key]??=[]).push(row);
    return all;
  },{});

  const inspectAccount=id=>{
    setAccount(id);setSearch('');setDraft('');setStatus('');setPage(0);
  };

  const isIntro=path=>path&&path.includes('/intro-');
  const isImage=path=>path&&/\.(jpg|jpeg|png|webp)$/i.test(path);

  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-serif text-2xl text-white">Kiểm duyệt phương tiện tải lên</h2>
        <p className="text-sm text-slate-400 mt-1">
          Nhật ký kiểm duyệt AI cho cả Video và Hình ảnh. Tách bạch rõ ràng giữa <strong>Video đại diện mở thư</strong> và <strong>Media bộ sưu tập (Gallery)</strong>.
        </p>
      </div>

      {/* Tìm kiếm tài khoản hoặc kỷ vật */}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={event=>{
          event.preventDefault();
          setSearch(draft.trim());
          setAccount('');
          setPage(0);
        }}
      >
        <label className="store-label flex-1 min-w-0">
          Tìm tài khoản hoặc kỷ vật
          <input
            className="store-input w-full"
            type="search"
            maxLength={120}
            placeholder="User ID, tên tác giả hoặc mã kỷ vật"
            value={draft}
            onChange={event=>setDraft(event.target.value)}
          />
        </label>
        <button className="store-button" type="submit">
          Tìm kiếm
        </button>
      </form>

      {account && (
        <div className="text-sm break-all space-y-2 p-3 rounded-xl bg-white/5 border border-white/10">
          <p>Đang xem toàn bộ lịch sử của tài khoản: <span className="font-mono text-amber-300">{account}</span></p>
          <button className="store-button" onClick={()=>{setAccount('');setPage(0);}}>
            Bỏ lọc tài khoản
          </button>
        </div>
      )}

      {/* Bộ lọc phân loại danh mục (Tách bạch Intro Video vs Gallery Media vs Ảnh/Video) */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
        <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          Bộ lọc phân loại & trạng thái
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Filter theo Category */}
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition ${
              category==='' ? 'bg-white text-dark-950 font-bold' : 'bg-black/40 text-slate-300 hover:bg-white/10'
            }`}
            onClick={()=>{setCategory('');setPage(0);}}
          >
            Tất cả vị trí
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition ${
              category==='intro' ? 'bg-amber-400 text-black font-bold' : 'bg-black/40 text-amber-300 hover:bg-white/10'
            }`}
            onClick={()=>{setCategory('intro');setPage(0);}}
          >
            Video đại diện
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition ${
              category==='gallery' ? 'bg-sky-400 text-black font-bold' : 'bg-black/40 text-sky-300 hover:bg-white/10'
            }`}
            onClick={()=>{setCategory('gallery');setPage(0);}}
          >
            Bộ sưu tập Kỷ niệm
          </button>

          <span className="border-r border-white/20 mx-1 hidden sm:inline" />

          {/* Filter theo Loại Media (Video vs Image) */}
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition ${
              mediaType==='' ? 'bg-white/20 text-white' : 'bg-black/40 text-slate-400 hover:bg-white/10'
            }`}
            onClick={()=>{setMediaType('');setPage(0);}}
          >
            Mọi định dạng
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition ${
              mediaType==='video' ? 'bg-indigo-400 text-black font-bold' : 'bg-black/40 text-indigo-300 hover:bg-white/10'
            }`}
            onClick={()=>{setMediaType('video');setPage(0);}}
          >
            Chỉ Video
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition ${
              mediaType==='image' ? 'bg-emerald-400 text-black font-bold' : 'bg-black/40 text-emerald-300 hover:bg-white/10'
            }`}
            onClick={()=>{setMediaType('image');setPage(0);}}
          >
            Chỉ Hình ảnh
          </button>
        </div>

        <div className="flex flex-wrap gap-3 items-center pt-2 border-t border-white/10">
          <label className="store-label !mb-0 flex items-center gap-2">
            <span>Trạng thái kiểm duyệt:</span>
            <select
              className="store-input text-xs py-1"
              value={status}
              disabled={busy}
              onChange={e=>{setStatus(e.target.value);setPage(0);}}
            >
              <option value="">Tất cả trạng thái</option>
              {Object.entries(statuses).map(([key,label])=>(
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="store-button ml-auto"
            disabled={busy}
            onClick={()=>setRefresh(value=>value+1)}
          >
            Làm mới
          </button>
        </div>
      </div>

      {error && <p role="alert" className="text-red-300 text-xs">{error}</p>}
      {busy && <p role="status" className="text-xs text-amber-200">Đang tải nhật ký kiểm duyệt...</p>}
      {!busy && !rows.length && (
        <div className="p-8 text-center rounded-xl bg-white/5 border border-white/10 text-slate-400 text-sm">
          Chưa có lượt tải nào phù hợp với bộ lọc hiện tại.
        </div>
      )}

      {/* Danh sách nhóm theo tài khoản */}
      {Object.entries(groups).map(([id,entries])=>(
        <section key={id} className="space-y-3 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/15 pb-2">
            <h3 className="font-semibold text-white break-all">
              {entries[0].author_name||'Tài khoản đã xóa'} · {entries.length} sự kiện trên trang này
            </h3>
            {id!=='deleted' && account!==id && (
              <button className="store-button text-xs" onClick={()=>inspectAccount(id)}>
                Xem toàn bộ lịch sử tài khoản
              </button>
            )}
          </div>

          {entries.map(row=>{
            const isIntroVideo=isIntro(row.path);
            const isPhoto=isImage(row.path);

            return (
              <article key={row.id} className="p-4 rounded-xl border border-white/15 bg-black/40 space-y-2.5 text-sm break-words">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{row.author_name}</strong>
                    {/* Badge phân loại rõ ràng: Video đại diện vs Gallery */}
                    {isIntroVideo ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-400/15 border border-amber-400/35 text-amber-300">
                        Video đại diện
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/15 border border-sky-500/35 text-sky-300">
                        Bộ sưu tập
                      </span>
                    )}
                    {/* Badge loại file */}
                    <span className="px-2 py-0.5 rounded text-[10px] bg-white/10 text-slate-300 font-mono">
                      {isPhoto ? 'Ảnh' : 'Video'}
                    </span>
                  </div>

                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    row.status==='rejected'?'bg-red-500/20 text-red-300 border border-red-500/30':
                    row.status==='ready'?'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30':
                    'bg-amber-500/20 text-amber-200 border border-amber-500/30'
                  }`}>
                    {statuses[row.status]||row.status}
                  </span>
                </div>

                <div className="text-xs text-slate-400 space-y-0.5">
                  <p>{new Date(row.created_at).toLocaleString('vi-VN')} · Kỷ vật: <span className="text-slate-300 font-mono">{row.tag}</span></p>
                  <p className="font-mono text-slate-500 break-all">Tài khoản: {row.user_id||'Đã xóa'} · Tệp: {row.path}</p>
                </div>

                {/* Nhãn AI trích xuất */}
                <div className="pt-1">
                  <span className="text-xs text-slate-400 mr-2">Nhãn chủ đề:</span>
                  {row.labels && row.labels.length > 0 ? (
                    <span className="text-xs text-amber-200 font-medium">
                      {row.labels.map(l=>`#${l}`).join('  ')}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500 italic">Chưa có nhãn</span>
                  )}
                </div>

                {/* Nhãn vi phạm (chỉ Admin thấy) */}
                <p className={row.violations?.length ? 'text-red-300 font-medium' : 'text-slate-400'}>
                  Nhãn vi phạm: {row.violations?.map(v=>VIOLATION_LABELS[v]||v).join(' · ')||'Không có kết luận vi phạm'}
                </p>

                {row.reason && (
                  <p className="text-xs text-amber-200 p-2 rounded bg-white/5 border border-white/10">
                    {row.reason}
                  </p>
                )}

                <p className="text-[11px] text-slate-500">
                  Model AI: {row.model} · Chính sách: {row.policy_version===0?'Chưa kiểm duyệt theo chính sách mới':`v${row.policy_version}`}
                </p>
              </article>
            );
          })}
        </section>
      ))}

      {/* Phân trang */}
      <div className="flex gap-3 items-center justify-between pt-2">
        <button className="store-button" disabled={busy||page===0} onClick={()=>setPage(p=>p-1)}>
          Trang trước
        </button>
        <span className="text-xs text-slate-300">Trang {page+1}</span>
        <button className="store-button" disabled={busy||rows.length<25} onClick={()=>setPage(p=>p+1)}>
          Trang sau
        </button>
      </div>
    </section>
  );
}
