import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ConfirmProvider } from './components/ui/ConfirmDialog.jsx'
import { ToastProvider } from './components/ui/Toast.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </ToastProvider>
  </React.StrictMode>,
)