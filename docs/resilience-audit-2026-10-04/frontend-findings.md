# Frontend resilience audit — 2026-10-04

Scope: React entry/root, all route families (`home`, `shop`, `nfc`, `memory`, `articles`, `article-detail`, `about`, `admin`, `memory-match`, `memory-house`), shared API/Auth/catalog/cart/checkout, media upload and movie export, public House preview/editor/renderer, AR workers/camera, article HTML boundary. Findings below are local-source findings. They do not prove the current deployed bundle is byte-for-byte identical, or that an outage has occurred in production.

Skills read: ECC `production-audit` and `security-review`. No production code edits, live load tests, account changes, storage uploads, or database writes.

## F1 — P1: Auth stall defeats request deadlines and can trap the whole site at startup

- Evidence: `src/services/apiClient.js:5` awaits `supabase.auth.getSession()` before creating the controller/timer at lines 9–13 and attaching caller cancellation. `src/lib/supabaseClient.js:26` enables token auto-refresh and does not supply a bounded custom fetch. Installed SDK: `node_modules/@supabase/supabase-js/src/lib/fetch.ts:83` awaits the token before forwarding the request signal; `SupabaseClient.ts:598` gets that token using `auth.getSession()`; `auth-js/src/GoTrueClient.ts:2865` awaits initialization and `:3100` refreshes expired sessions; `auth-js/src/lib/fetch.ts:227` awaits network fetch without an application deadline.
- Real trigger: a returning user has an expired cached token while the Supabase Auth request stalls (network handoff, flaky proxy/Wi-Fi, provider/network incident). The REST timeout is not yet running. API calls for catalog, account, memory, checkout, and studio remain pending until Auth resolves.
- Startup blast radius: `src/services/authRoleService.js:38` uses the same authenticated Supabase RPC wrapper for the otherwise public system-status request. Its `AbortSignal.timeout(8000)` only reaches the eventual raw network fetch after token acquisition. If acquisition is stalled, the fallback at `:44` is never reached and `src/App.jsx:177` never sets `systemReady`; `:374` leaves every route behind the full-screen entry gate.
- Verified offline: actual `apiRequest` function body, mocked unresolved `getSession()`, `timeoutMs=10`: request still pending after 80 ms, API fetch calls = 0. After Auth is released, it succeeds after about 90 ms, exceeding the configured budget. The actual installed SDK fetch wrapper also remains pending with a pre-aborted signal while token acquisition is mocked unresolved.
- Fix: apply one deadline/cancellation budget to the entire operation including session retrieval; use anonymous fetch/client for public status/catalog reads; bound the Auth fetch itself; always present a recoverable startup error with retry. Protect writes by reporting uncertain results and retaining existing idempotency keys.
- Existing protection: REST fetch and body consumption have an AbortController after session lookup; explicit anonymous status fallback bypasses getSession. These protections do not cover the first Auth wait.
- Classification: client availability / objective dependency failure; this does not show an unauthenticated attacker can directly cause a backend crash.

## F2 — P1: Three stalled animation images indefinitely block the homepage

- Evidence: `src/services/showcaseFrames.js:10` caps active images at 3; only `onload`/`onerror` at `:19–45` release a slot; image fetch and `image.decode()` have no deadline. `:110` sets failure only after all 150 frames settle, and `:129` disallows retry while failure is false. `src/App.jsx:464` wraps homepage content in this gate. `src/components/MotionEntryGate.jsx:14` renders a fixed, full-screen `z-[200]` overlay, and `:39` offers retry only when `failed` is true.
- Real trigger: the first three image downloads or decode promises stall during partial asset/CDN failure or a weak mobile connection. Alternatively, a missing required early frame settles as failed while later frames never finish. The queue cannot progress to a playable contiguous prefix and cannot reach the all-settled failure condition.
- Failure scope: homepage appears permanently stuck on “Đang chuẩn bị…” with no visible path into shop/navigation. Deep links to other views bypass the animation dependency; this is not a server outage.
- Verified offline: mock Image class with no completion callbacks, call `preload()` and priority `request(20)`. Exactly 3 images remain in flight, no frame settles, snapshot stays `ready=false/failed=false`, and sequence retry does nothing.
- Fix: per-image/decode deadlines, overall startup deadline, fail-open static poster/home content, and a visible action into shop while cosmetic frames load. Preserve the 3-request concurrency cap.
- Existing protection: optimized WebP, JPEG fallback, bounded concurrent image loading, throughput-based 30–150 initial buffer, and failed-image retry after all requests settle.

## F3 — P2: Valid but malformed persisted cart can blank every route for that browser

- Evidence: `src/App.jsx:112–113` JSON-parses `emoria_cart_v1` without validating an array or rows. `:440` unconditionally reduces it before children or the inner route error boundary can handle errors. `src/main.jsx:11–15` mounts App without a parent/root error boundary.
- Real trigger: an older release, browser extension, manual import, or another same-origin writer leaves valid JSON such as `null`, `{}`, or `[null]` in the cart key. Invalid JSON is caught; these valid wrong shapes are not. Reload repeats the same failure until storage is repaired.
- Verified offline: the exact initializer and cart-count expression throw TypeError for all three fixtures.
- Failure scope: entire app in the affected browser/profile; no backend/database outage. A remote attacker needs an additional same-origin write capability/XSS to set another user's cart; that capability was not demonstrated.
- Fix: parse and validate schema, discard invalid rows, bound cart size, validate positive finite integer quantity, rehydrate trusted product data, remove/quarantine unusable cache, and add root error recovery with a targeted cart-reset action.
- Existing protection: `try/catch` handles parse errors/storage denial; cart stock and quantity are checked during normal add-to-cart; checkout prices are server controlled.

## F4 — P2 operational scenario: Status outage turns all non-admin traffic into a persistent maintenance page

- Evidence: `src/services/authRoleService.js:24–29` defaults configured-server state to maintenance; `:54–57` converts any failure of the public RPC + REST fallback into that state. `src/App.jsx:175–177` checks once on mount, `:375–379` blocks ROLES.GUEST, and `:379–425` offers an auth/VIP form rather than status retry. Authenticated ordinary users also retain role `guest` (`authRoleService.js:159`).
- Real trigger: system-status RPC and Vercel fallback fail briefly (e.g. DB/network incident), then recover after the startup read. Existing pages remain maintenance-gated for the rest of the visit until refresh; static home/about and catalog are also obscured.
- Classification: a deliberate fail-closed design with a large availability blast radius, not proof of exploitable authorization weakness. Keep sensitive writes and maintenance authorization server enforced.
- Improvement: distinguish dependency-unavailable from confirmed-maintenance, add retry with bounded backoff and status freshness, let static routes render when reasonable, and show status recovery as soon as the provider is reachable.

## H1 — Resource budget hypothesis; no OOM reproduced

- `showcaseFrames.js:16` retains image objects, `:96–100` retains the sequence globally, and `:136` preloads all 150 frames. `ProductExplodedShowcase.jsx:131–146` unsubscribes but does not dispose the shared sequence on navigation.
- Optimized dimensions from `scripts/optimize-public-images.py:32–39`: mobile 640×360, desktop 960×540. Offline JPEG metadata confirms the fallback is 1920×1080.
- For 150 simultaneously retained RGBA decoded frames, arithmetic pixel budgets are approximately **131.84 MiB** mobile, **296.63 MiB** desktop, **1186.52 MiB** original JPEG fallback, before GPU canvases, DOM and AR/movie/House memory. This is a budget estimate, not measured resident memory: browsers may evict decoded caches and do not promise this exact format/residency.
- Risk scenario: low-memory mobile tab reload/kill or heavy decode jank, particularly if optimized assets fail and original JPEG fallback takes over, or the visitor subsequently opens AR/movie rendering. Verify with real browser memory/long-task traces on target devices before describing it as a confirmed crash.
- Improvement: bounded rolling decoded frame cache, static poster fallback on constrained devices, optimized fallback assets, release sequence when idle/after navigation, prefer video if visual fidelity and interaction allow.

## Current protections and route coverage

- Lazy routes/modals have `DeferredContent` render/chunk error recovery with reload. It is inside App and cannot catch App's own cart evaluation.
- Articles fetch with cancellation and pagination; article HTML is DOMPurify-sanitized with constrained tags/styles/URLs and escaping for markdown. No confirmed XSS path found in reviewed render boundary.
- Memory loading rejects stale responses via sequence IDs, optional House load does not block the authorized letter, PIN and ownership are server delegated.
- Gallery caps 30 media and pipeline concurrency 2; moderate API has a 175 s timeout after session lookup. Upload itself uses Supabase Storage and lacks an application deadline/cancel path, so a stalled upload can keep editor busy; this is covered by the wider dependency/cancellation recommendation.
- Movie editor bounds 12 clips, 180 s, 200 MiB inputs, 50 MiB output, 720p canvas; media waits time out after 15 s, decoding stalls after 10 s, export supports cancellation and releases streams/audio/media.
- House has 5 rooms/10 photos per room, fixed decoration catalog/placement validation, on-demand rendering, hidden/offscreen pause, 512 px generated textures, context-lost error, and available 2D mode. Source images are decoded before texture downsampling; dimension quotas/transcoding should also be checked server-side if handling untrusted images.
- AR validates same-origin GLB URLs, downsizes worker bitmaps to 512 px, permits one frame request at a time, falls back to manual tracking after 30 s, stops workers/camera/WebGL on close/hidden tab. Actual browser/GPU behavior was not stress tested.
- Cart/checkout preserves same request ID during uncertain order retries and clamps normal quantities; backend must remain authoritative for prices/stock/payment, as current service delegates.
- Admin components use authenticated API and service checks; UI restrictions alone were not treated as server authorization.

## Offline reproduction

Run from repository root: `node docs/resilience-audit-2026-10-04/frontend-repro.mjs`.

Observed pass output:

```json
{
  "networkRequests": 0,
  "cartCases": ["null", "{}", "[null]"],
  "cartResult": "TypeError for all fixtures",
  "apiTimeoutMs": 10,
  "authMockWaitMs": 80,
  "apiFetchesDuringWait": 0,
  "apiStillPending": true,
  "sdkPreAbortedRequestDuringTokenWait": "still pending",
  "imageRequestsInFlight": 3,
  "entry": {"ready": false, "failed": false},
  "jpegFallback": {"width": 1920, "height": 1080},
  "estimatedDecodedRGBA_MiB": {"mobile": 131.8359375, "desktop": 296.630859375, "fallback": 1186.5234375}
}
```

Output above condenses the script's observed JSON and does not claim a browser end-to-end crash test. The script reads source, uses bounded offline mocks, and has no production effects.
