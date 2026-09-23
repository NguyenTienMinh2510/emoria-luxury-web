import {FilesetResolver,HandLandmarker} from '@mediapipe/tasks-vision';
let model;
self.onmessage=async({data})=>{
  try{
    if(data.type==='init'){
      const files=await FilesetResolver.forVisionTasks(new URL('/ar/runtime',self.location.origin).href,true);
      model=await HandLandmarker.createFromOptions(files,{
        baseOptions:{modelAssetPath:'/ar/hand_landmarker.task',delegate:'CPU'},
        runningMode:'VIDEO',
        numHands:1,
        minHandDetectionConfidence:.55,
        minTrackingConfidence:.55
      });
      self.postMessage({type:'ready'});
    }else if(data.type==='frame'){
      try{
        const result=model.detectForVideo(data.bitmap,data.time);
        self.postMessage({type:'hand',points:result.landmarks[0]||null});
        // HandLandmarkerResult contains arrays only (unlike PoseLandmarkerResult).
      }finally{
        data.bitmap.close();
      }
    }
  }catch(error){
    if(import.meta.env.DEV)console.warn('AR hand worker failed:',error.message);
    self.postMessage({type:'error'});
  }
};
