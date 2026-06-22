import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initErrorLog } from './lib/errorLog.js';
import './styles/safe-area.css';
import './styles/index.css';

initErrorLog();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
