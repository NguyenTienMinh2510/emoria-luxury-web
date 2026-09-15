import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import analyticsHandler from './api/analytics.js';
import memoryMediaHandler from './api/memory-media.js';

// https://vitejs.dev/config/
export default defineConfig(({mode}) => {
  const env=loadEnv(mode,process.cwd(),'');
  for(const key of ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','VITE_SUPABASE_PUBLISHABLE_KEY','GA4_PROPERTY_ID','GA4_SERVICE_ACCOUNT_JSON','SUPABASE_SERVICE_ROLE_KEY']) if(env[key]!==undefined)process.env[key]=env[key];
  return {
  plugins: [react(),{name:'emoria-api',configureServer(server){server.middlewares.use('/api/analytics',analyticsHandler);server.middlewares.use('/api/memory-media',memoryMediaHandler);}}],
  server: {
    port: 3000,
    host: '127.0.0.1',
    strictPort: true,
    open: false
  }
};});
