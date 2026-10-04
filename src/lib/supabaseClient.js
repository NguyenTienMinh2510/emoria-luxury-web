import { createClient } from '@supabase/supabase-js';
import {fetchWithDeadline,createRequestBudget} from '../services/requestBudget.js';

const env = (typeof import.meta !== 'undefined' && import.meta.env)
  ? import.meta.env
  : (typeof process !== 'undefined' && process.env ? process.env : {});

const supabaseUrl = env.VITE_SUPABASE_URL || '';
const supabaseAnonKey =
  env.VITE_SUPABASE_ANON_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  '';

export const isSupabaseConfigured = () => {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('http') &&
    !supabaseUrl.includes('placeholder')
  );
};

export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey, {
      global: {fetch: (input, init) => fetchWithDeadline(input, init, 15000)},
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : createClient('https://placeholder.supabase.co', 'placeholder-anon-key', {
      auth: {
        persistSession: false,
      },
    });

// Public status must never acquire/refresh the user's Auth session.
export async function fetchPublicSystemStatus({signal,timeoutMs=8000}={}) {
  if (!isSupabaseConfigured()) throw new Error('Chưa cấu hình kết nối máy chủ.');
  const budget=createRequestBudget({signal,timeoutMs});
  try {
    const headers={'Content-Type':'application/json',apikey:supabaseAnonKey};
    if (!supabaseAnonKey.startsWith('sb_')) headers.Authorization=`Bearer ${supabaseAnonKey}`;
    const response=await budget.wait(fetch(`${supabaseUrl.replace(/\/$/,'')}/rest/v1/rpc/rpc_get_system_status`,{
      method:'POST',headers,body:'{}',signal:budget.signal,credentials:'omit',cache:'no-store',
    }));
    if(!response.ok)throw new Error('Không thể đọc trạng thái hệ thống.');
    return await budget.wait(response.json());
  } finally {budget.dispose();}
}

export default supabase;
