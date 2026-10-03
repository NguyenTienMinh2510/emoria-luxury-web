import assert from 'node:assert/strict';
import {HOUSE_PRESETS,ROOM_PRESETS,applyPresetToRooms,applyPresetToSingleRoom,getRoomPresetId,getHousePresetId} from '../src/data/housePresets.js';
import {serializeHouseRooms,houseGalleryMemories} from '../src/services/house3d.js';
import {createHousePresetSession} from '../src/services/housePresetSession.js';

const initial = () => ({title:'Our house',theme:'warm_gold',rooms:applyPresetToRooms(Object.keys(ROOM_PRESETS).map(id=>({id,name:id,note:'Keep this note',memories:Array.from({length:10},(_,i)=>({id:`${id}-${i}`,photo_path:`tag/${i}.png`,caption:`Photo ${i}`})),journey_letter:{title:'Keep',content:'Letter'},lighting:'sunset'})))});
for(const [id,presets] of Object.entries(ROOM_PRESETS)) for(const preset of presets) {
  const room=applyPresetToSingleRoom(initial().rooms.find(r=>r.id===id),preset.id);
  assert.equal(getRoomPresetId(serializeHouseRooms([room])[0]),preset.id,'Selection survives serialization and reload');
  const displayed=new Set([...houseGalleryMemories(room).map(m=>m.id),...room.decorations.flatMap(d=>d.photos||[])]);
  assert.equal(displayed.size,10,'Every photo remains visible in furniture or the gallery');
  assert.deepEqual(room.furnishingBaseline,room.decorations.map(({text,photos,...d})=>d));
  const template=structuredClone(preset.decorations);
  room.decorations[0].position[0]+=1;
  assert.deepEqual(preset.decorations,template,'Editing furniture cannot mutate the reusable template');
  assert.notEqual(room.decorations[0].position[0],room.furnishingBaseline[0].position[0],'Baseline stays immutable');
  assert.equal(getRoomPresetId(room),null,'Custom layouts are not labeled as the original preset');
}
let house=initial(),writes=[],fail=false,resolveSave,hold=false,flushed=0;
const session=createHousePresetSession({read:()=>house,flush:async()=>{flushed++;},save:async next=>{writes.push(structuredClone(next));if(hold)await new Promise(r=>resolveSave=r);if(fail)throw Error('Offline');},commit:next=>{house=next;}});
const original=structuredClone(house);
assert.equal(getHousePresetId(house),'cozy');
await session.preview('vintage','beginning');
assert.equal(session.locked,true);assert.equal(writes.length,0);assert.deepEqual(house,original);
assert.equal(getRoomPresetId(session.state.preview.next.rooms[0]),'vintage');
assert.deepEqual(session.state.preview.next.rooms.slice(1),original.rooms.slice(1));
assert.equal(await session.preview('minimalist'),false,'Another preset cannot replace an active preview');
assert.equal(await session.run(()=>{throw Error('Should stay locked');}),false,'Upload/publish/manual saves share the preview lock');
session.cancel();assert.equal(session.locked,false);assert.deepEqual(house,original);assert.equal(writes.length,0);

await session.preview('vintage','beginning');fail=true;
await assert.rejects(session.apply(),/Offline/);
assert.deepEqual(house,original,'Failed persistence leaves the visible saved house untouched');
assert.equal(session.state.undo,null);assert.ok(session.state.preview,'Failure retains a retryable preview');
fail=false;hold=true;const saving=session.apply();
assert.equal(await session.apply(),false,'Double click cannot write twice');
assert.equal(await session.undo(),false);session.cancel();assert.ok(session.state.preview);
resolveSave();await saving;hold=false;
assert.equal(getRoomPresetId(house.rooms[0]),'vintage');assert.equal(getRoomPresetId(house.rooms[1]),'cozy');assert.equal(getHousePresetId(house),null);
assert.equal(session.state.preview,null);assert.ok(session.state.undo);
house.rooms[0].note='Edited after applying';house.rooms[0].memories.shift();
house.rooms[1].note='Other room edit';
await session.undo();assert.equal(getRoomPresetId(house.rooms[0]),'cozy');
assert.equal(house.rooms[0].note,'Edited after applying');assert.equal(house.rooms[0].memories.length,9);assert.equal(house.rooms[1].note,'Other room edit');
assert.ok(house.rooms[0].decorations.every(d=>(d.photos||[]).every(id=>id===null||house.rooms[0].memories.some(m=>m.id===id))));
for(const preset of HOUSE_PRESETS) {
  await session.preview(preset.id);assert.equal(getHousePresetId(session.state.preview.next),preset.id);
  await session.apply();assert.equal(getHousePresetId(house),preset.id);
}
const beforeUndo=house.theme;house.theme='rose_romance';await session.undo();assert.equal(house.theme,'rose_romance','Undo preserves a later custom theme');
await session.preview('vintage');house.title='Concurrent change';
await assert.rejects(session.apply(),/đã thay đổi/);session.cancel();
await assert.rejects(session.preview('unknown'),/Không tìm thấy/);assert.equal(session.locked,false);

await session.preview('minimalist');hold=true;const obsolete=session.apply();
session.reset();house=initial();resolveSave();await obsolete;
assert.equal(getHousePresetId(house),'cozy','An obsolete save cannot update another loaded house');
assert.equal(session.state.undo,null);assert.ok(flushed>0);
console.log('PASS preset sessions: 20 templates, photo visibility, reload selection, immutable baseline, preview/cancel, write failure/retry, synchronous lock, latest-content undo and stale saves.');
