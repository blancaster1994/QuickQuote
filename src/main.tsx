import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);

// Pre-React splash dismissal. The element is rendered statically by
// index.html and stays in the DOM until React's first paint completes.
// We wait two animation frames to let the App's first render settle, then
// fade out and remove. The remaining bootstrap (IPC handshake, projects
// fetch) is covered by App's own <LoadingScreen> in the same brand style.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const splash = document.getElementById('qq-splash');
    if (!splash) return;
    splash.classList.add('qq-splash-out');
    setTimeout(() => splash.remove(), 300);
  });
});
