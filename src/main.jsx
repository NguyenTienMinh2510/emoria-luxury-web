import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import StoreProvider from './components/StoreProvider.jsx';
import LanguageProvider from './i18n/LanguageProvider.jsx';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider><StoreProvider><App /></StoreProvider></LanguageProvider>
  </React.StrictMode>,
);
