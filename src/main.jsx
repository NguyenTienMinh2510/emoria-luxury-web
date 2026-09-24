import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import StoreProvider from './components/StoreProvider.jsx';
import LanguageProvider from './i18n/LanguageProvider.jsx';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { getAnalyticsConsent } from './services/analyticsService.js';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <StoreProvider>
        <App />
        <Analytics
          beforeSend={(event) => {
            if (getAnalyticsConsent() === 'denied') return null;
            if (event?.url && (event.url.includes('/memory') || event.url.includes('/admin'))) {
              return null;
            }
            return event;
          }}
        />
        <SpeedInsights
          beforeSend={(data) => {
            if (getAnalyticsConsent() === 'denied') return null;
            return data;
          }}
        />
      </StoreProvider>
    </LanguageProvider>
  </React.StrictMode>,
);
