// One writer per mounted entity. Calls queued during a write run afterwards;
// every promise settles and failures stop subsequent writes until explicit retry.
export function createDraftQueue(write) {
  let revision=0,tail=Promise.resolve(),failure=null,pending=0;
  return {
    reset(value=0){if(pending)throw new Error('Bản nháp vẫn đang lưu.');revision=value;failure=null;},
    get revision(){return revision;},
    get pending(){return pending;},
    enqueue(payload,{retry=false}={}){
      const snapshot=structuredClone(payload);pending++;
      const task=tail.then(async()=>{
        if(retry&&failure?.code!=='DRAFT_CONFLICT')failure=null;
        if(failure)throw failure;
        try{const result=await write(snapshot,revision);revision=result.draft_revision??result.progress_revision??revision;return result;}
        catch(error){failure=error;if(error.message?.includes('DRAFT_CONFLICT'))error.code='DRAFT_CONFLICT';throw error;}
      }).finally(()=>pending--);
      tail=task.catch(()=>{});return task;
    },
    async flush(){await tail;if(failure)throw failure;},
  };
}
