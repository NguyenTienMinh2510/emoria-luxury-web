import React,{useState,useEffect} from 'react';
import NfcTools from './NfcTools';
import {nfcMemoryUrl} from '../services/nfc.js';
import {apiRequest} from '../services/apiClient.js';
import {useLanguage} from '../i18n/LanguageProvider';
export function OrderGiftSetup({order,onRefresh}) {
  const {t,locale}=useLanguage();
  const [issued,setIssued]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [unassignedChips,setUnassignedChips]=useState([]),[selectedChipId,setSelectedChipId]=useState({}),[chipAssignSuccess,setChipAssignSuccess]=useState({});

  const loadUnassignedChips=async()=>{
    try{
      const data=await apiRequest('/admin/nfc-chips?search=&page=0');
      if(Array.isArray(data)){
        setUnassignedChips(data.filter(c=>!c.tag_uid&&c.active));
      }
    }catch(_){}
  };

  useEffect(()=>{loadUnassignedChips();},[]);

  const allocate=async item=>{
    setBusy(true);setError('');
    try{
      const memory=await apiRequest(`/admin/orders/${encodeURIComponent(order.id)}/memories`,{method:'POST',body:{title:item.name,itemId:item.orderItemId}});
      setIssued(prev=>[...prev,memory]);
      await loadUnassignedChips();
      onRefresh?.();
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };

  const handleQuickAssignChip=async(memoryTagUid)=>{
    const chipId=selectedChipId[memoryTagUid];
    if(!chipId)return;
    setBusy(true);setError('');
    try{
      const targetChip=unassignedChips.find(c=>c.id===chipId);
      if(!targetChip)throw new Error(t('Không tìm thấy chip đã chọn.','Selected chip not found.'));
      await apiRequest(`/admin/nfc-chips/${encodeURIComponent(chipId)}`,{
        method:'PATCH',
        body:{
          label:targetChip.label,
          memoryTag:memoryTagUid,
          active:true,
          version:targetChip.version
        }
      });
      setChipAssignSuccess(prev=>({...prev,[memoryTagUid]:targetChip.label}));
      await loadUnassignedChips();
      onRefresh?.();
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };

  return <details className="p-3 border border-white/10 rounded-xl"><summary className="cursor-pointer font-semibold">{t('Chi tiết món hàng & cấp Memory Space','Items & Memory Space allocation')}</summary><div className="space-y-4 pt-4">
    <p className="text-sm text-slate-400">{t('Cấp kỷ vật trực tiếp cho tài khoản mua hàng và gán nhanh vào chip NFC trống ngay tại đây.','Allocate a space directly to the buyer account and link quickly to an empty NFC chip here.')}</p>
    {order.note&&<p className="whitespace-pre-wrap">{order.note}</p>}
    {order.items.map(item=><div key={item.orderItemId||item.id+item.size} className="flex flex-wrap items-center gap-3"><p className="flex-1">{item.name} · {item.size} · ×{item.quantity} · {new Intl.NumberFormat(locale).format(item.price)} đ</p><button className="store-button" disabled={busy||!['confirmed','crafting_nfc','shipping','completed'].includes(order.status)||!item.orderItemId} onClick={()=>allocate(item)}>{t('Cấp 1 Memory Space','Allocate 1 Memory Space')}</button></div>)}
    {issued.map(memory=><div key={memory.tag_uid} className="p-4 bg-amber-200/10 border border-amber-400/20 rounded-xl space-y-2">
      <p className="font-semibold text-amber-200">{t('Đã cấp cho tài khoản mua hàng.','Allocated to the buyer account.')}</p>
      <p className="text-xs font-mono text-slate-300">Tag UID: {memory.tag_uid}</p>
      <a href={nfcMemoryUrl(memory.tag_uid)} target="_blank" rel="noreferrer" className="text-xs underline break-all text-amber-300 block">{nfcMemoryUrl(memory.tag_uid)}</a>
      {chipAssignSuccess[memory.tag_uid] ? (
        <div className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs">
          ✓ {t('Đã liên kết nhanh với Chip:','Linked to chip:')} {chipAssignSuccess[memory.tag_uid]}
        </div>
      ) : unassignedChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-slate-300">{t('Gán nhanh vào chip NFC trống:','Quick link to empty chip:')}</span>
          <select
            value={selectedChipId[memory.tag_uid] || ''}
            onChange={e=>setSelectedChipId(prev=>({...prev,[memory.tag_uid]:e.target.value}))}
            className="px-2 py-1 rounded bg-black/60 border border-white/20 text-xs text-slate-200 focus:outline-none"
          >
            <option value="">-- {t('Chọn chip trống','Select empty chip')} --</option>
            {unassignedChips.map(c=>(
              <option key={c.id} value={c.id}>{c.label} ({c.id.slice(0, 8)}...)</option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy||!selectedChipId[memory.tag_uid]}
            onClick={()=>handleQuickAssignChip(memory.tag_uid)}
            className="store-button text-xs py-1 px-3 disabled:opacity-50"
          >
            {busy?t('Đang gán…','Assigning…'):t('Gán ngay','Assign now')}
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-slate-400">{t('Không còn chip trống. Đăng ký thêm chip mới bên dưới nếu cần.','No empty chips available. Register a new chip below if needed.')}</p>
      )}
    </div>)}
    {order.trackingNumber&&<p>{t('Mã vận đơn','Tracking number')}: {order.trackingNumber}</p>}{error&&<p role="alert" className="text-red-300">{error}</p>}
  </div></details>;
}
export default function NfcOperations(){
  const {t}=useLanguage();
  const [rows,setRows]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false);
  const [search,setSearch]=useState(''),[page,setPage]=useState(0),[refresh,setRefresh]=useState(0);
  const [selected,setSelected]=useState(null),[label,setLabel]=useState(''),[tag,setTag]=useState(''),[active,setActive]=useState(true);
  const [memories,setMemories]=useState([]);
  useEffect(()=>{let live=true;setBusy(true);const timer=setTimeout(()=>{
    apiRequest('/admin/nfc-chips?'+new URLSearchParams({search,page})).then(data=>{if(live){setRows(data);setError('');}}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setBusy(false);});
  },250);return()=>{live=false;clearTimeout(timer);};},[search,page,refresh]);
  useEffect(()=>{let live=true;const timer=setTimeout(()=>{apiRequest('/admin/memories?'+new URLSearchParams({search:tag})).then(data=>{if(live)setMemories(data);}).catch(()=>{if(live)setMemories([]);});},250);return()=>{live=false;clearTimeout(timer);};},[tag]);
  const reset=()=>{setSelected(null);setLabel('');setTag('');setActive(true);};
  const save=async event=>{event.preventDefault();if(saving)return;setSaving(true);setError('');try{
    await apiRequest('/admin/nfc-chips'+(selected?`/${selected.id}`:''),{method:selected?'PATCH':'POST',body:{label,memoryTag:tag.trim()||null,active,...(selected?{version:selected.version}:{})}});
    reset();setRefresh(n=>n+1);
  }catch(e){setError(e.message);}finally{setSaving(false);}};
  return <section className="space-y-5 min-w-0"><h2 className="font-serif text-2xl">{t('Chip NFC & đường link riêng','NFC chips & independent links')}</h2>
    <p className="text-sm text-slate-400">{t('Chip chỉ mở đường link tới kỷ vật. Quyền xem và sửa được cấp riêng cho tài khoản tại Memory Space. Thay đổi liên kết không đổi chủ sở hữu.','A chip opens a link to a memory. Viewing and editing permissions are assigned separately in Memory Spaces. Changing a chip link does not change ownership.')}</p>
    <form onSubmit={save} className="p-4 rounded-xl border border-white/15 space-y-3">
      <h3>{selected?t('Chỉnh liên kết chip','Edit chip link'):t('Đăng ký chip','Register chip')}</h3>
      <label className="store-label">{t('Tên chip','Chip label')}<input required maxLength={100} className="store-input" value={label} onChange={e=>setLabel(e.target.value)}/></label>
      <label className="store-label">{t('Mã Memory Space (để trống nếu chưa gán)','Memory Space ID (leave empty to unassign)')}<input list="nfc-memory-options" maxLength={64} className="store-input" value={tag} onChange={e=>setTag(e.target.value)}/><datalist id="nfc-memory-options">{memories.map(m=><option key={m.tag_uid} value={m.tag_uid}>{m.title} · {m.owner_name}</option>)}</datalist></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/>{t('Cho phép mở link chip','Enable chip link')}</label>
      <div className="flex gap-3"><button className="store-button" disabled={saving}>{saving?t('Đang lưu…','Saving…'):t('Lưu chip','Save chip')}</button>{selected&&<button type="button" className="underline" onClick={reset}>{t('Hủy','Cancel')}</button>}</div>
    </form>
    <label className="store-label">{t('Tìm chip, tên hoặc mã kỷ vật','Search chip ID, label or memory ID')}<input type="search" className="store-input" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label>
    <button className="store-button" disabled={busy} onClick={()=>setRefresh(n=>n+1)}>{t('Làm mới','Refresh')}</button>
    {error&&<p role="alert" className="text-red-300">{error}</p>}{busy&&<p role="status">{t('Đang tải…','Loading…')}</p>}
    {!busy&&!rows.length&&<p>{t('Chưa có chip phù hợp.','No matching chips.')}</p>}
    {rows.map(row=><article key={row.id} className="p-4 rounded-xl border border-white/10 space-y-3 break-words"><h3 className="font-semibold">{row.label} · {row.active?t('Đang bật','Enabled'):t('Đã tắt','Disabled')}</h3><code className="text-xs break-all">{row.id}</code><p>{row.tag_uid?`${row.title} · ${row.tag_uid}`:t('Chưa gán kỷ vật','No memory assigned')}</p>
      <button className="store-button" onClick={()=>{setSelected(row);setLabel(row.label);setTag(row.tag_uid||'');setActive(row.active);window.scrollTo({top:0,behavior:'smooth'});}}>{t('Gán / đổi / gỡ liên kết','Assign / change / unlink')}</button>
      <details><summary className="cursor-pointer">{t('Ghi & kiểm tra chip','Write & verify chip')}</summary><NfcTools chipId={row.id}/></details>
    </article>)}
    <p className="text-xs text-slate-400">{t('Link chip giữ nguyên khi đổi kỷ vật. Các chip đã ghi link ?tag= trước đây vẫn mở trực tiếp kỷ vật; hãy ghi lại link ?chip= để quản lý riêng.','Chip URLs stay unchanged when reassigned. Existing ?tag= chips still open their memory directly; rewrite them with a ?chip= link for independent management.')}</p>
    <div className="flex justify-between gap-3"><button className="store-button" disabled={busy||page===0} onClick={()=>setPage(n=>n-1)}>{t('Trang trước','Previous')}</button><span>{page+1}</span><button className="store-button" disabled={busy||rows.length<25} onClick={()=>setPage(n=>n+1)}>{t('Trang sau','Next')}</button></div>
  </section>;
}
