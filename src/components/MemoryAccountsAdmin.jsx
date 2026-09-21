import React,{useEffect,useState} from 'react';
import {apiRequest} from '../services/apiClient.js';
import {nfcMemoryUrl} from '../services/nfc.js';
import {useLanguage} from '../i18n/LanguageProvider.jsx';
import AccountPicker from './AccountPicker.jsx';

export default function MemoryAccountsAdmin(){
  const {t}=useLanguage();
  const [rows,setRows]=useState([]),[search,setSearch]=useState(''),[page,setPage]=useState(0),[refresh,setRefresh]=useState(0),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [account,setAccount]=useState(null),[title,setTitle]=useState(''),[selected,setSelected]=useState(null),[role,setRole]=useState('recipient');
  useEffect(()=>{
    let active=true;setLoading(true);setRows([]);setError('');
    apiRequest('/admin/memories?'+new URLSearchParams({search,page})).then(data=>{if(active)setRows(data);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[search,page,refresh]);
  const run=async action=>{if(busy)return;setBusy(true);setError('');setMessage('');try{await action();setRefresh(v=>v+1);}catch(e){setError(e.message);}finally{setBusy(false);}};
  const submit=e=>{e.preventDefault();if(!account)return;run(async()=>{
    if(!selected){const data=await apiRequest('/admin/memories',{method:'POST',body:{ownerId:account.id,title}});setMessage(t('Đã cấp Memory Space: ','Memory Space allocated: ')+data.tag_uid);setTitle('');}
    else{
      if(role==='owner'&&!window.confirm(t('Chuyển quyền sở hữu? Chủ cũ sẽ mất quyền sửa và các phiên mở khóa cũ sẽ bị thu hồi.','Transfer ownership? The previous owner loses editing access and existing unlock sessions will be revoked.')))return;
      await apiRequest(`/admin/memories/${encodeURIComponent(selected.tag_uid)}/${role==='owner'?'owner':'recipients/'+encodeURIComponent(account.id)}`,{method:'PUT',body:role==='owner'?{userId:account.id,version:selected.version}:{}});
      setMessage(t('Đã cập nhật quyền tài khoản.','Account access updated.'));setSelected(null);
    }
    setAccount(null);
  });};
  return <section className="space-y-5 min-w-0">
    <h2 className="font-serif text-2xl">{t('Memory Space & tài khoản','Memory Spaces & accounts')}</h2>
    <p className="text-sm text-slate-400">{t('Cấp không gian trực tiếp cho tài khoản. Chủ sở hữu được chỉnh sửa; người nhận chỉ được xem. Không cần chip NFC.','Allocate spaces directly to accounts. Owners can edit; recipients can only view. No NFC chip is required.')}</p>
    <form onSubmit={submit} className="p-4 border border-white/15 rounded-xl space-y-4">
      <h3 className="font-semibold break-all">{selected?t('Cấp quyền: ','Assign access: ')+selected.title:t('Tạo Memory Space mới','Create a Memory Space')}</h3>
      {!selected?<label className="store-label">{t('Tên kỷ vật','Memory title')}<input required maxLength={200} className="store-input" value={title} disabled={busy} onChange={e=>setTitle(e.target.value)}/></label>:<label className="store-label">{t('Quyền truy cập','Access role')}<select className="store-input" value={role} disabled={busy} onChange={e=>setRole(e.target.value)}><option value="recipient">{t('Người nhận · chỉ xem','Recipient · view only')}</option><option value="owner">{t('Chủ sở hữu · chỉnh sửa','Owner · edit content')}</option></select></label>}
      <AccountPicker value={account} onChange={setAccount} disabled={busy}/>
      <div className="flex flex-wrap gap-3"><button disabled={busy||!account} className="store-button">{busy?t('Đang lưu…','Saving…'):selected?t('Cấp quyền','Assign access'):t('Tạo và cấp cho tài khoản','Create and assign to account')}</button>{selected&&<button className="store-button" type="button" disabled={busy} onClick={()=>{setSelected(null);setAccount(null);}}>{t('Hủy','Cancel')}</button>}</div>
    </form>
    {error&&<p role="alert" className="text-red-300">{error}</p>}{message&&<p role="status" className="text-emerald-300 break-all">{message}</p>}
    <label className="store-label">{t('Tìm Memory Space','Find a Memory Space')}<input className="store-input" type="search" maxLength={120} value={search} placeholder={t('Tên, mã kỷ vật, chủ sở hữu','Title, memory ID, owner')} onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label>
    {loading&&<p role="status">{t('Đang tải…','Loading…')}</p>}
    {!loading&&!rows.length&&<p>{t('Chưa có kỷ vật phù hợp.','No matching memories.')}</p>}
    {rows.map(row=><article key={row.tag_uid} className="border border-white/15 rounded-xl p-4 space-y-3 break-words">
      <h3 className="font-serif text-xl">{row.title}</h3><code className="text-xs break-all">{row.tag_uid}</code>
      <p>{t('Chủ sở hữu: ','Owner: ')}{row.owner_name||t('Chưa cấp','Unassigned')}</p><p className="text-xs text-slate-400 break-all">{row.owner_id}</p>
      <p className="text-sm">{t('Chip đã gán: ','Linked chips: ')}{row.chip_count} · {row.admin_suspended?t('Đang tạm khóa','Suspended'):t('Đang hoạt động','Active')}</p>
      <a href={nfcMemoryUrl(row.tag_uid)} target="_blank" rel="noreferrer" className="underline text-sm">{t('Mở link kỷ vật','Open memory link')}</a>
      <div className="flex flex-wrap gap-3"><button disabled={busy} className="store-button" onClick={()=>{setSelected(row);setAccount(null);setRole('recipient');window.scrollTo({top:0,behavior:'smooth'});}}>{t('Cấp quyền tài khoản','Assign account access')}</button><button disabled={busy} className="store-button" onClick={()=>run(()=>apiRequest(`/admin/memories/${encodeURIComponent(row.tag_uid)}/suspension`,{method:'PATCH',body:{suspended:!row.admin_suspended}}))}>{row.admin_suspended?t('Mở lại kỷ vật','Resume memory'):t('Tạm khóa kỷ vật','Suspend memory')}</button></div>
      <h4 className="font-semibold text-sm">{t('Người nhận · chỉ xem','Recipients · view only')}</h4>
      {!row.recipients.length&&<p className="text-sm text-slate-400">{t('Chưa cấp cho người nhận nào.','No recipients assigned.')}</p>}
      {row.recipients.map(recipient=><div key={recipient.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="break-all">{recipient.name} · {recipient.email||recipient.id}</span><button className="underline text-red-300" disabled={busy} onClick={()=>run(()=>apiRequest(`/admin/memories/${encodeURIComponent(row.tag_uid)}/recipients/${recipient.id}`,{method:'DELETE',body:{}}))}>{t('Thu hồi quyền xem','Revoke viewing access')}</button></div>)}
    </article>)}
    <div className="flex items-center gap-3"><button className="store-button" disabled={busy||loading||page===0} onClick={()=>setPage(v=>v-1)}>{t('Trước','Previous')}</button><span>{t('Trang','Page')} {page+1}</span><button className="store-button" disabled={busy||loading||rows.length<25} onClick={()=>setPage(v=>v+1)}>{t('Sau','Next')}</button></div>
  </section>;
}
