import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.tsx'

// eslint-disable-next-line react-refresh/only-export-components
function Root() {
  useEffect(() => {
    const saved = (localStorage.getItem('gx-theme') as 'light' | 'dark') || 'dark'
    document.documentElement.setAttribute('data-theme', saved)
  }, [])
  return (
    <>
      <Toaster position="bottom-right" toastOptions={{
        style: {
          background: 'var(--gx-bg-alt)',
          color: 'var(--gx-text)',
          border: '1px solid var(--gx-border)',
        },
      }} />
      <App />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </StrictMode>,
)
