const timeoutError = () => new DOMException('Yêu cầu quá thời gian chờ. Vui lòng thử lại.', 'TimeoutError');

// A deadline covers preparation (including Auth), network transfer and parsing.
export function createRequestBudget({ timeoutMs = 20000, signal } = {}) {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(timeoutError()), timeoutMs);
  return {
    signal: controller.signal,
    async wait(operation) {
      controller.signal.throwIfAborted();
      let cancel;
      const interrupted = new Promise((_, reject) => {
        cancel = () => reject(controller.signal.reason);
        controller.signal.addEventListener('abort', cancel, { once: true });
      });
      try { return await Promise.race([operation, interrupted]); }
      finally { controller.signal.removeEventListener('abort', cancel); }
    },
    dispose() { clearTimeout(timer); signal?.removeEventListener('abort', abort); },
  };
}

export async function fetchWithDeadline(input, init = {}, timeoutMs = 15000) {
  const budget = createRequestBudget({ timeoutMs, signal: init.signal });
  try {
    const response=await budget.wait(fetch(input, { ...init, signal: budget.signal }));
    // Supabase parses the response after fetch returns. Bound that body transfer too.
    const body=await budget.wait(response.arrayBuffer());
    return new Response([204,205,304].includes(response.status)?null:body,{status:response.status,statusText:response.statusText,headers:response.headers});
  }
  finally { budget.dispose(); }
}
