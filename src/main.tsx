import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { requestPersistentStorage } from './lib/db';
import { startFoodSearch } from './lib/useFoodSearch';
import './styles.css';

void requestPersistentStorage();

// Build the offline food search index once the app is idle, so the first search is instant.
const idle = window.requestIdleCallback?.bind(window) ?? ((cb: () => void) => setTimeout(cb, 1500));
idle(() => startFoodSearch());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
