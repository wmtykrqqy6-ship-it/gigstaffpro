import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ConfirmProvider } from './components/ui/ConfirmDialog.jsx'
import { ToastProvider } from './components/ui/Toast.jsx'
import './index.css'
import { applyAppBranding } from './utils/businessName'

// Name the app after the business (cached from Settings -> System) before
// anything renders; App refreshes it from the server at startup.
applyAppBranding()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </ToastProvider>
  </React.StrictMode>,
)

// Push-notification service worker (public/sw.js). It caches nothing, so
// registering it can't change how the site loads.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
