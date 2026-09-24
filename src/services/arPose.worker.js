import {FilesetResolver,PoseLandmarker} from '@mediapipe/tasks-vision';
let model;
self.onmessage=async({data})=>{
  try{
    if(data.type==='init'){
      const files=await FilesetResolver.forVisionTasks(new URL('/ar/runtime',self.location.origin).href,true);
      model=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'/ar/pose_landmarker_lite.task',delegate:'CPU'},runningMode:'VIDEO',numPoses:1,outputSegmentationMasks:false,minPoseDetectionConfidence:.6,minTrackingConfidence:.6});
      self.postMessage({type:'ready'});
    }else if(data.type==='frame'){
      try{const result=model.detectForVideo(data.bitmap,data.time);self.postMessage({type:'pose',time:data.time,points:result.landmarks[0]||null,worldPoints:result.worldLandmarks?.[0]||null});result.close();}
      finally{data.bitmap.close();}
    }
  }catch(error){if(import.meta.env.DEV)console.warn('AR worker failed:',error.message);self.postMessage({type:'error'});}
};
