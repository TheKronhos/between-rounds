import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

interface ToastState {
  id: number;
  message: string;
  actions: ToastAction[];
  duration: number;
}

type ShowToast = (message: string, actions?: ToastAction[], duration?: number) => void;

const ToastContext = createContext<ShowToast>(() => {});

export const useToast = () => useContext(ToastContext);

/** One toast at a time; a new one replaces the old. Default 5 seconds (SPEC-logging §1 Undo window). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const seq = useRef(0);

  const show = useCallback<ShowToast>((message, actions = [], duration = 5000) => {
    seq.current += 1;
    setToast({ id: seq.current, message, actions, duration });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), toast.duration);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region no-print" role="status" aria-live="polite">
        {toast && (
          <div className="toast" key={toast.id}>
            <span className="toast-msg">{toast.message}</span>
            {toast.actions.map((a) => (
              <button
                key={a.label}
                className="btn btn-quiet toast-btn"
                onClick={async () => {
                  setToast(null);
                  await a.onClick();
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
