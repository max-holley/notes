import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.ts';
import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
