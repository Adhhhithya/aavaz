import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          fontFamily: 'Inter, sans-serif',
          borderRadius: '12px',
          border: '1px solid var(--color-canvas-border)',
        },
      }}
    />
  </StrictMode>,
)
