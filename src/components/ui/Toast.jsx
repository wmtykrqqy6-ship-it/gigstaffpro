import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';

const ToastContext = createContext(null);
let idCounter = 0;

// Replacement for window.alert() — a non-blocking, auto-dismissing toast
// instead of a native dialog that freezes the page until clicked.
// Type defaults to an inference off the message text so existing call sites
// ('Error saving: ...' vs 'Saved!') don't need to be rewritten to pass one.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const notify = useCallback((message, type) => {
    const id = ++idCounter;
    const resolvedType = type || (/error|fail/i.test(message) ? 'error' : 'success');
    setToasts(prev => [...prev, { id, message, type: resolvedType }]);
    setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="fixed top-4 right-4 z-[300] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            className={`pointer-events-auto flex items-start gap-2 p-4 rounded-lg shadow-lg cursor-pointer text-sm whitespace-pre-line ${
              t.type === 'error'
                ? 'bg-red-50 border border-red-200 text-red-800'
                : 'bg-green-50 border border-green-200 text-green-800'
            }`}
          >
            {t.type === 'error'
              ? <XCircle size={18} className="flex-shrink-0 mt-0.5" />
              : <CheckCircle size={18} className="flex-shrink-0 mt-0.5" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Usage mirrors window.alert(): notify('Saved!'); or notify('Error: ' + err.message);
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
