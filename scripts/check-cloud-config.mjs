// Read-only checks. Never prints keys, user data or changes the remote project.
import fs from 'node:fs';
const env = { ...process.env };
for (const name of ['.env', '.env.local']) {
  if (!fs.existsSync(name)) continue;
  for (const line of fs.readFileSync(name, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const base = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!base || !key) {
  console.log('BLOCKED: missing Project URL or publishable key');
  process.exitCode = 1;
} else {
  for (const [label, route] of [
    ['Auth health', '/auth/v1/health'],
    ['Memory schema', '/rest/v1/memory_spaces?select=tag_uid&limit=0'],
    ['Checkout schema', '/rest/v1/checkout_products?select=id&limit=0'],
  ]) {
    try {
      const result = await fetch(new URL(route, base), { headers: { apikey: key }, signal: AbortSignal.timeout(15000) });
      console.log(`${label}: HTTP ${result.status}`);
      if (!result.ok) process.exitCode = 1;
    } catch (error) {
      console.log(`${label}: ${error.cause?.code || error.name}`);
      process.exitCode = 1;
    }
  }
}
