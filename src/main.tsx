import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource-variable/inter';
import App from './App';
import ErrorBoundary from './ErrorBoundary';
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
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </HashRouter>
  </StrictMode>,
);
