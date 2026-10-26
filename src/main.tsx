import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { requestPersistentStorage } from './db';
import { syncBuiltIns } from './data';
import './install';
import './styles.css';

registerSW({ immediate: true });
void requestPersistentStorage();
void syncBuiltIns();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
