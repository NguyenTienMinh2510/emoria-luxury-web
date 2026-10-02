// Keep shared links specific, and never copy a session/PIN grant into a public preview.
export function createShareUrl(params, origin = window.location.origin) {
  const url = new URL('/share', origin);
  const query = params instanceof URLSearchParams ? params : new URLSearchParams(params);
  for (const key of ['view', 'share', 'match', 'invite', 'article', 'tag', 'memory', 'chip', 'policy']) {
    const value = query.get(key);
    if (value) url.searchParams.set(key, value);
  }
  if (query.get('privacy') === 'true') url.searchParams.set('policy', 'privacy');
  return url.href;
}

export function isShareRoute(query) {
  return ['article', 'tag', 'memory', 'chip', 'share', 'match', 'invite'].some(key => query.has(key)) ||
    ['memory-house', 'memory-match'].includes(query.get('view')) ||
    query.get('policy') === 'privacy' || query.get('privacy') === 'true';
}
