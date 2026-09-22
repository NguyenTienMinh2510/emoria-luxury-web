import {cp,mkdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const poseModel=new URL('../public/ar/pose_landmarker_lite.task',import.meta.url);
if(createHash('sha256').update(await readFile(poseModel)).digest('hex')!=='59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a')throw Error('Pose AR model integrity check failed');
const handModel=new URL('../public/ar/hand_landmarker.task',import.meta.url);
if(createHash('sha256').update(await readFile(handModel)).digest('hex')!=='fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1')throw Error('Hand AR model integrity check failed');
await mkdir(new URL('../public/ar/runtime/',import.meta.url),{recursive:true});
await cp(new URL('../node_modules/@mediapipe/tasks-vision/wasm/',import.meta.url),new URL('../public/ar/runtime/',import.meta.url),{recursive:true});
console.log('AR: pinned local models (pose + hand) verified; WASM runtime prepared.');
