import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/i18n'
import { isTauriShell } from './lib/native/shell'
import App from './App'

// Shell marker for CSS that must stay out of the Tauri shells (currently the
// web-only suppression of the native back swipe, see index.css)
if (isTauriShell()) document.documentElement.dataset.tauriShell = '1'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
