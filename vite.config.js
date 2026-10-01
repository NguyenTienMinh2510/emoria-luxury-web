import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import paymentHandler from './api/sepay-webhook.js';
import analyticsHandler from './api/analytics.js';
import memoryMediaHandler from './api/memory-media.js';
import restHandler from './api/v1.js';

// https://vitejs.dev/config/ - updated for local sandbox
export default defineConfig(({mode}) => {
  const env=loadEnv(mode,process.cwd(),'');
  if(env.MODAL_TAGGER_URL!==undefined)process.env.MODAL_TAGGER_URL=env.MODAL_TAGGER_URL;
  if(env.MODAL_LETTER_URL!==undefined)process.env.MODAL_LETTER_URL=env.MODAL_LETTER_URL;
  for(const key of ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','VITE_SUPABASE_PUBLISHABLE_KEY','GA4_PROPERTY_ID','GA4_SERVICE_ACCOUNT_JSON','SUPABASE_SERVICE_ROLE_KEY','SEPAY_WEBHOOK_KEY','SEPAY_ACCOUNT_NUMBER','SEPAY_MODE']) if(env[key]!==undefined)process.env[key]=env[key];
  return {
  plugins: [react(),{name:'emoria-api',configureServer(server){
    server.middlewares.use('/api/v1',restHandler);
    server.middlewares.use('/api/sepay-webhook',paymentHandler);
    server.middlewares.use('/api/analytics',analyticsHandler);
    server.middlewares.use('/api/memory-media',memoryMediaHandler);
  }}],
  build: {rollupOptions:{
    input:{main:'index.html',arPreview:'ar-preview.html',lumenPreview:'lumen-preview.html'},
    output:{manualChunks(id){
      if(id.includes('/node_modules/three/build/')) return id.endsWith('/three.core.js')?'three-core':'three-renderer';
      if(/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
      if(id.includes('/node_modules/@supabase/')) return 'supabase';
      if(/\/node_modules\/(framer-motion|motion-dom|motion-utils)\//.test(id)) return 'motion';
    }}
  }},
  server: {
    port: 3000,
    host: '127.0.0.1',
    strictPort: true,
    open: false
  }
};});
