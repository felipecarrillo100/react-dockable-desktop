import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import App from './App.tsx'
import { registerDemoPanels } from './mockupPanels'

// Register the demo panels dynamically at startup
registerDemoPanels();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
