import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// S10-T01: Design System "Thanh Tịnh & Trang Nghiêm" (token + primitives dùng chung)
import '../../../packages/shared/styles/index.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Overlay #root element not found');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
