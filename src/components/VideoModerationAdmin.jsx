import React,{useEffect,useState} from 'react';
import {apiRequest} from '../services/apiClient.js';
import {VIOLATION_LABELS} from '../services/videoLabels.js';
const statuses={uploaded:'Đã tải · chờ kiểm duyệt',processing:'Đang kiểm duyệt',ready:'Được chấp nhận',rejected:'Bị từ chối',failed:'Lỗi kỹ thuật'};
export default function VideoModerationAdmin(){
  const [rows,setRows]=useState([]),[status,setStatus]=useState(''),[page,setPage]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [draft,setDraft]=useState(''),[search,setSearch]=useState(''),[account,setAccount]=useState(''),[refresh,setRefresh]=useState(0);
  useEffect(()=>{
    let active=true;setBusy(true);setRows([]);setError('');
    apiRequest('/admin/video-uploads?'+new URLSearchParams({status,page,search,user:account}))
      .then(data=>{if(active)setRows(data);}).catch(e=>{if(active)setError(e.message);})
      .finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;};
  },[status,page,search,account,refresh]);
  const groups=rows.reduce((all,row)=>{const key=row.user_id||'deleted';(all[key]??=[]).push(row);return all;},{});
  const inspectAccount=id=>{setAccount(id);setSearch('');setDraft('');setStatus('');setPage(0);};
  return <section className="space-y-4"><h2 className="font-serif text-2xl">Kiểm duyệt video tải lên</h2>
    <p className="text-sm text-slate-400">Nhật ký theo từng bước tải và kiểm duyệt. Nhãn AI là tín hiệu kiểm tra; lỗi kỹ thuật không phải vi phạm. Một video có thể có nhiều dòng nhật ký.</p>
    <form className="flex flex-wrap items-end gap-3" onSubmit={event=>{event.preventDefault();setSearch(draft.trim());setAccount('');setPage(0);}}>
      <label className="store-label flex-1 min-w-0">Tìm tài khoản hoặc kỷ vật<input className="store-input w-full" type="search" maxLength={120} placeholder="User ID, tên tác giả hoặc mã kỷ vật" value={draft} onChange={event=>setDraft(event.target.value)}/></label>
      <button className="store-button" type="submit">Tìm kiếm</button>
    </form>
    {account&&<div className="text-sm break-all space-y-2"><p>Toàn bộ lịch sử tài khoản: {account} (phân trang)</p><button className="store-button" onClick={()=>{setAccount('');setPage(0);}}>Bỏ lọc tài khoản</button></div>}
    <div className="flex flex-wrap gap-3"><label className="store-label">Trạng thái<select className="store-input" value={status} disabled={busy} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="">Tất cả</option>{Object.entries(statuses).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><button type="button" className="store-button" disabled={busy} onClick={()=>setRefresh(value=>value+1)}>Làm mới</button></div>
    {error&&<p role="alert" className="text-red-300">{error}</p>}{busy&&<p role="status">Đang tải nhật ký…</p>}
    {!busy&&!rows.length&&<p className="text-slate-400">Chưa có lượt tải phù hợp.</p>}
    {Object.entries(groups).map(([id,entries])=><section key={id} className="space-y-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/15 pb-2"><h3 className="font-semibold break-all">{entries[0].author_name||'Tài khoản đã xóa'} · {entries.length} sự kiện trên trang này</h3>{id!=='deleted'&&account!==id&&<button className="store-button" onClick={()=>inspectAccount(id)}>Xem toàn bộ lịch sử tài khoản</button>}</div>
      {entries.map(row=><article key={row.id} className="p-4 rounded-xl border border-white/15 space-y-2 text-sm break-words">
      <div className="flex flex-wrap justify-between gap-2"><strong>{row.author_name}</strong><span className={row.status==='rejected'?'text-red-300':row.status==='ready'?'text-emerald-300':'text-amber-200'}>{statuses[row.status]||row.status}</span></div>
      <p className="text-xs text-slate-400">{new Date(row.created_at).toLocaleString('vi-VN')} · Kỷ vật: {row.tag}</p><p className="text-xs text-slate-500 break-all">Tài khoản: {row.user_id||'Đã xóa'} · Tệp: {row.path}</p>
      <p>Nhãn chủ đề: {row.labels?.join(' · ')||'Chưa có'}</p><p className={row.violations?.length?'text-red-300':'text-slate-400'}>Nhãn vi phạm: {row.violations?.map(v=>VIOLATION_LABELS[v]||v).join(' · ')||'Không có kết luận vi phạm'}</p>
      {row.reason&&<p>{row.reason}</p>}<p className="text-xs text-slate-500">Model: {row.model} · Chính sách: {row.policy_version===0?'Chưa kiểm duyệt theo chính sách mới':row.policy_version}</p>
    </article>)}
    </section>)}
    <div className="flex gap-3 items-center"><button className="store-button" disabled={busy||page===0} onClick={()=>setPage(p=>p-1)}>Trước</button><span>Trang {page+1}</span><button className="store-button" disabled={busy||rows.length<25} onClick={()=>setPage(p=>p+1)}>Sau</button></div>
  </section>;
}
