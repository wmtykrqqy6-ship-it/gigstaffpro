import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';

const ToastContext = createContext(null);
let idCounter = 0;

// A fixed 5s dismiss worked fine for short confirmations ("Saved!") but was
// cutting off longer warnings (conflict explanations, cancellation notices)
// before a reader could get through them -- especially a problem for
// slower or older readers. Duration now scales with message length (~17
// chars/sec, a relaxed reading pace), clamped to a sane range. Hovering
// pauses the countdown entirely so a toast never vanishes out from under
// someone mid-read.
const MIN_DURATION_MS = 4000;
const MAX_DURATION_MS = 15000;
const READING_CHARS_PER_SECOND = 17;

// Replacement for window.alert() — a non-blocking, auto-dismissing toast
// instead of a native dialog that freezes the page until clicked.
// Type defaults to an inference off the message text so existing call sites
// ('Error saving: ...' vs 'Saved!') don't need to be rewritten to pass one.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  // id -> { timeoutId, remaining, startedAt } -- tracked in a ref (not
  // state) since pausing/resuming on hover shouldn't trigger re-renders.
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    const t = timers.current[id];
    if (t?.timeoutId) clearTimeout(t.timeoutId);
    delete timers.current[id];
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const startTimer = useCallback((id, duration) => {
    timers.current[id] = {
      timeoutId: setTimeout(() => dismiss(id), duration),
      remaining: duration,
      startedAt: Date.now(),
    };
  }, [dismiss]);

  const pauseTimer = useCallback((id) => {
    const t = timers.current[id];
    if (!t) return;
    clearTimeout(t.timeoutId);
    t.remaining = Math.max(0, t.remaining - (Date.now() - t.startedAt));
  }, []);

  const resumeTimer = useCallback((id) => {
    const t = timers.current[id];
    if (!t) return;
    t.startedAt = Date.now();
    t.timeoutId = setTimeout(() => dismiss(id), t.remaining);
  }, [dismiss]);

  const notify = useCallback((message, type) => {
    const id = ++idCounter;
    const resolvedType = type || (/error|fail/i.test(message) ? 'error' : 'success');
    setToasts(prev => [...prev, { id, message, type: resolvedType }]);
    const duration = Math.min(
      MAX_DURATION_MS,
      Math.max(MIN_DURATION_MS, Math.round((message.length / READING_CHARS_PER_SECOND) * 1000))
    );
    startTimer(id, duration);
  }, [startTimer]);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="fixed top-4 right-4 z-[300] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            onMouseEnter={() => pauseTimer(t.id)}
            onMouseLeave={() => resumeTimer(t.id)}
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
