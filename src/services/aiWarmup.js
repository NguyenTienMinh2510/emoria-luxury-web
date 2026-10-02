/**
 * Pre-warm the Modal Qwen GPU container in the background.
 * Triggered proactively when the user enters the Studio or opens
 * the AI Letter Muse / Media Editor.
 *
 * This masks the ~30-40s Cold Start during the "dead time" when the user
 * is typing, choosing options, or browsing their hard drive for photos/videos.
 */

import {apiRequest} from './apiClient.js';
let isWarmed = false;
let warmingPromise = null;

export function triggerAiWarmup() {
  if (isWarmed || warmingPromise) return warmingPromise;

  warmingPromise = (async () => {
    try {
      const data = await apiRequest('/ai/warmup',{method:'POST',body:{task:'warmup'},timeoutMs:50000});
      if(data.success)isWarmed = true;
    } catch {
      // Proactive background ping fails gracefully with zero impact on UI
    } finally {
      warmingPromise = null;
    }
  })();

  return warmingPromise;
}
