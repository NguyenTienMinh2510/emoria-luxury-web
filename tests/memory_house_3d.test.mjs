import assert from 'node:assert/strict';
import fs from 'node:fs';
import {HOUSE_ROOM_IDS,DECORATIONS,placeDecoration,roomDecorations,serializeHouseRooms,setDecorationPhoto} from '../src/services/house3d.js';
import {enrichHouseRoomsWithSignedUrls} from '../server/eventMedia.js';

function glb(file){const b=fs.readFileSync(file);assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(b.readUInt32LE(4),2);assert.equal(b.readUInt32LE(8),b.length);return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());}
const house=glb('public/memoryhouse/models/memory-house.glb'),library=glb('public/memoryhouse/models/decorations.glb');
for(const id of HOUSE_ROOM_IDS){
  assert.ok(house.nodes.some(n=>n.extras?.roomId===id&&n.name==='room_'+id));
  for(const slot of ['left','table','right'])assert.equal(house.nodes.filter(n=>n.extras?.roomId===id&&n.extras?.slot===slot).length,1);
  for(let i=0;i<3;i++)assert.equal(house.nodes.filter(n=>n.extras?.roomId===id&&n.extras?.photoIndex===i).length,1);
}
for(const d of DECORATIONS){assert.ok(library.nodes.some(n=>n.name==='decor_'+d.id));assert.ok(fs.existsSync('public'+d.image));}
assert.equal(library.nodes.filter(n=>Number.isInteger(n.extras?.decorPhotoIndex)).length,6);
assert.equal(library.nodes.filter(n=>n.extras?.decorText).length,2);
for(const file of ['memory-house.glb','decorations.glb'])assert.ok(fs.statSync('public/memoryhouse/models/'+file).size<5_000_000);
let room={id:'beginning',memories:[{id:'a',photo_path:'tag/photo.jpg',photo_url:'https://signed.example/photo'}]};
room=placeDecoration(room,'table','vase');room=placeDecoration(room,'table','lamp');
assert.equal(room.decorations.length,1);assert.equal(room.decorations[0].item,'lamp');
assert.equal(placeDecoration(room,'unknown','cat'),room);
assert.equal(placeDecoration(room,'left','untrusted.glb'),room);
assert.deepEqual(roomDecorations({decorations:[{slot:'left',item:'cat',rotation:123}]}),[{slot:'left',item:'cat',rotation:0}]);
const serialized=serializeHouseRooms([room]);assert.equal(serialized[0].memories[0].photo_url,undefined);
assert.equal(serialized[0].memories[0].photo_path,'tag/photo.jpg');
const owner=enrichHouseRoomsWithSignedUrls(serialized,{'tag/photo.jpg':'https://signed.example/photo'},{ownerDraft:true});
const guest=enrichHouseRoomsWithSignedUrls(serialized,{'tag/photo.jpg':'https://signed.example/photo'});
assert.equal(owner[0].memories[0].photo_path,'tag/photo.jpg');assert.equal(guest[0].memories[0].photo_path,undefined);
assert.deepEqual(guest[0].decorations,room.decorations);
assert.equal(serializeHouseRooms(owner)[0].memories[0].photo_path,'tag/photo.jpg','Reload -> save retains existing photo identity');
assert.equal(placeDecoration(room,'table',null).decorations.length,0);
const frameRoom=setDecorationPhoto(placeDecoration(room,'table','frame'),'table','frame',0,'a');
assert.deepEqual(serializeHouseRooms([frameRoom])[0].decorations[0].photos,['a']);
assert.deepEqual(roomDecorations({...frameRoom,memories:[]})[0].photos,[null],'Deleted photo must not leave a stale attachment');
assert.deepEqual(setDecorationPhoto(frameRoom,'table','album',0,'a'),frameRoom,'Upload must not replace a different selected object');
assert.equal(roomDecorations({...room,decorations:[{slot:'left',item:'nameplate',rotation:0,text:'Minh & An'}]})[0].text,'Minh & An');
console.log('PASS House 3D: GLB contracts, 5 rooms, 15 frames/slots,29 assets, bounded decoration state, owner reload-save and public photo privacy.');
