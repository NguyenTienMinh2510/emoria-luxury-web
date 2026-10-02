// Capture a fresh full-house image for each publication, with a small storage budget.
export async function captureHouseShareFile(capture, house) {
  let source;
  if (capture) source = await capture({overview:true});
  if (!source && house) {
    const host = document.createElement('div');
    host.setAttribute('aria-hidden','true');
    Object.assign(host.style,{position:'fixed',left:'-10000px',top:'0',width:'1200px',height:'630px',pointerEvents:'none'});
    document.body.appendChild(host);
    let engine;
    try {
      const {createHouseRenderer} = await import('./house3dRenderer.js');
      engine = createHouseRenderer(host,{isEditing:()=>false});
      engine.update(house);
      source = await engine.captureWhenReady();
    } catch { /* The draft stays intact when this device cannot create a 3D capture. */ }
    finally { engine?.dispose();host.remove(); }
  }
  if (!source) throw new Error('Chưa tạo được ảnh toàn cảnh 3D. Hãy chờ ảnh tải xong, mở chế độ 3D hoặc dùng thiết bị hỗ trợ 3D rồi xuất bản lại.');
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Trình duyệt chưa hỗ trợ tạo ảnh chia sẻ.');
  ctx.fillStyle = '#f1e9df'; ctx.fillRect(0,0,canvas.width,canvas.height);
  const ratio = Math.min(canvas.width / image.width,canvas.height / image.height);
  ctx.drawImage(image,(canvas.width-image.width*ratio)/2,(canvas.height-image.height*ratio)/2,image.width*ratio,image.height*ratio);
  const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/jpeg',.86));
  if (!blob || blob.size > 2*1024*1024) throw new Error('Ảnh toàn cảnh quá lớn. Vui lòng thử lại.');
  return new File([blob],'house-overview.jpg',{type:'image/jpeg'});
}
