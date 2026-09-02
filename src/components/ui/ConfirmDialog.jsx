import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

const ConfirmContext = createContext(null);

// Promise-based replacement for window.confirm(). Renders as an in-app modal
// instead of a native browser dialog, so it never blocks script execution
// (native confirm()/alert() freeze the whole page, including any automated
// tooling or background timers, until a human clicks a button).
export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null); // { message }
  const resolveRef = useRef(null);
  // Only one dialog renders at a time. Without a queue, a second confirm()
  // call while one is already showing would overwrite resolveRef and
  // silently strand the first caller's promise forever (it never resolves,
  // so whatever code was awaiting it never runs) — queuing instead means a
  // second concurrent call just waits its turn.
  const queueRef = useRef([]);

  const showNext = useCallback(() => {
    const next = queueRef.current.shift();
    if (next) {
      resolveRef.current = next.resolve;
      setDialog({ message: next.message });
    }
  }, []);

  const confirmAction = useCallback((message) => {
    return new Promise((resolve) => {
      queueRef.current.push({ message, resolve });
      if (!resolveRef.current) showNext();
    });
  }, [showNext]);

  const handleChoice = (result) => {
    setDialog(null);
    if (resolveRef.current) {
      const resolve = resolveRef.current;
      resolveRef.current = null;
      resolve(result);
    }
    showNext();
  };

  return (
    <ConfirmContext.Provider value={confirmAction}>
      {children}
      {dialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <div className="flex items-start gap-3 mb-5">
              <AlertTriangle size={22} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-gray-900 whitespace-pre-line">{dialog.message}</p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => handleChoice(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => handleChoice(true)}
                autoFocus
                className="px-4 py-2 rounded-lg bg-red-900 text-white hover:bg-red-800 text-sm font-medium"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

// Usage mirrors window.confirm(): const ok = await confirm('Delete this?'); if (!ok) return;
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}
