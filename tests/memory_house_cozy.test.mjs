import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DECORATIONS,withEditableHouseFurniture,serializeHouseRooms,HOUSE_ROOM_IDS,getRotatedExtents,createCozyHouseRooms,planCozyHouseUpgrade} from '../src/services/house3d.js';

assert.equal(DECORATIONS.length,46);
assert.equal(new Set(DECORATIONS.map(d=>d.id)).size,46);
const fresh=createCozyHouseRooms(HOUSE_ROOM_IDS.map(id=>({id,memories:[]})));
for(const [id,items] of [['beginning',['daisy-rug','capybara','cat']],['first',['bistro-table','shiba']],['little-things',['turntable','fern','duck','duckling']],['memories',['sofa','teddy','album']],['next-chapter',['desk','rabbit','bunting']]]) {
  assert.ok(items.every(item=>fresh.find(r=>r.id===id).decorations.some(d=>d.item===item)),`H05 furnishings exist in ${id}`);
}
const saved=[{id:'memories',furnishingVersion:1,note:'Private letter',memories:[{id:'p',photo_path:'owner/keep.jpg'}],decorations:[{id:'custom',item:'frame',position:[-3,3.4,-1.1],surface:'wall',photos:['p'],text:'Keep me',scale:.6,rotation:0}]}];
const hit=(roomId,item,o)=>({position:o.position,surface:DECORATIONS.find(d=>d.id===item).defaultSurface,scale:o.scale});
const safe=planCozyHouseUpgrade(saved,hit);
assert.deepEqual(safe.rooms[0].decorations[0],saved[0].decorations[0]);
assert.ok(!safe.rooms[0].decorations.some(d=>d.item==='sofa'),'Ambiguous deletion of a legacy type is never reversed automatically');
const opted=planCozyHouseUpgrade(saved,hit,{rearrange:true});
assert.equal(opted.rooms[0].note,saved[0].note);assert.deepEqual(opted.rooms[0].memories,saved[0].memories);
assert.deepEqual(opted.rooms[0].decorations.find(d=>d.id==='custom').photos,['p']);
assert.equal(opted.rooms[0].decorations.find(d=>d.id==='custom').text,'Keep me');
assert.deepEqual(planCozyHouseUpgrade(opted.rooms,()=>{throw Error('Must not rerun');},{rearrange:true}).rooms,opted.rooms,'Successful rearrangement is idempotent');
const deleted={...opted.rooms[0],decorations:opted.rooms[0].decorations.filter(d=>d.item!=='sofa')};
assert.deepEqual(planCozyHouseUpgrade([deleted],hit,{rearrange:true}).rooms,[deleted],'Saved deletions remain deleted after reopen');
const extent=getRotatedExtents('sofa',[2,1.5,.5],90);
assert.deepEqual([extent.halfX,extent.halfZ,extent.height],[.18,1.65,1.2],'Bounds follow each scale axis and yaw');
const rooms=HOUSE_ROOM_IDS.map(id=>({id,note:'keep',memories:[{id:'photo',photo_path:'tag/photo.jpg'}],decorations:[{id:'custom',item:'frame',position:[0,1,0],surface:'wall',photos:['photo'],text:'keep',scale:.5,rotation:15}]}));
const upgraded=withEditableHouseFurniture(rooms);
assert.deepEqual(withEditableHouseFurniture(upgraded),upgraded,'Furniture migration runs once');
for(let i=0;i<rooms.length;i++){
  assert.deepEqual(upgraded[i].memories,rooms[i].memories);
  assert.deepEqual(upgraded[i].decorations.find(d=>d.id==='custom'),rooms[i].decorations[0],'Freeform transforms and photo attachments stay intact');
  const deleted={...upgraded[i],decorations:upgraded[i].decorations.filter(d=>!d.id.startsWith('base_'))};
  assert.deepEqual(withEditableHouseFurniture([deleted])[0],deleted,'Deleted furniture stays deleted after reopen');
}
assert.equal(serializeHouseRooms(upgraded)[0].furnishingVersion,1);
const legacy=withEditableHouseFurniture([{id:'beginning',memories:[],decorations:[{slot:'table',item:'mugs',rotation:0}]}])[0];
const mug=legacy.decorations.find(d=>d.item==='mugs');
assert.deepEqual(mug.position,[-2.8,.51,.70]);
assert.equal(mug.parent_id,'base_beginning_coffee-table');
for(const d of DECORATIONS){const bytes=fs.readFileSync('public'+d.image.split('?')[0]);assert.equal(bytes.readUInt16BE(0),0xffd8,'Actual model thumbnails are JPEG');}
if(process.argv.includes('--sources')){
  const manifest=JSON.parse(fs.readFileSync('docs/memoryhouse/cozy-catalog.json','utf8'));
  assert.equal(manifest.sourceFiles.length,57);
  for(const source of manifest.sourceFiles){const bytes=fs.readFileSync(source.path);assert.equal(bytes.length,source.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256);}
  for(const asset of manifest.assets)assert.ok(fs.existsSync(asset.sourceReference));
  assert.equal(new Set([...manifest.assets.map(d=>d.referenceId).filter(Boolean),...manifest.excluded.map(d=>d.referenceId)]).size,46,'Every object reference is retained or explicitly excluded');
}
console.log('PASS cozy catalog:46 model thumbnails, one-time furniture migration, stable saved transforms/photos, no furniture resurrection'+(process.argv.includes('--sources')?',57 source hashes preserved.':'.'));
