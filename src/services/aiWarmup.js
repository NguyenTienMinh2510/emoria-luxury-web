/**
 * Pre-warm the Modal Qwen GPU container in the background.
 * Triggered proactively when the user enters the Studio or opens
 * the AI Letter Muse / Media Editor.
 *
 * This masks the ~30-40s Cold Start during the "dead time" when the user
 * is typing, choosing options, or browsing their hard drive for photos/videos.
 */

let isWarmed = false;
let warmingPromise = null;

export function triggerAiWarmup() {
  if (isWarmed || warmingPromise) return warmingPromise;

  warmingPromise = (async () => {
    try {
      const response = await fetch('/api/v1/ai/warmup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'warmup' }),
        // Background timeout: fails silently if network is offline
        signal: AbortSignal.timeout(50000)
      });
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data.success) {
          isWarmed = true;
        }
      }
    } catch {
      // Proactive background ping fails gracefully with zero impact on UI
    } finally {
      warmingPromise = null;
    }
  })();

  return warmingPromise;
}
