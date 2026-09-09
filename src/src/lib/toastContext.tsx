"use client";

import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
  href?: string;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string, href?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const COLORS: Record<ToastType, string> = {
  success: "#4caf50",
  error: "#f44336",
  info: "#2196f3",
  warning: "#ff9800",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((type: ToastType, message: string, href?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, message, href }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0">
        {toasts.map((t) => {
          const Icon = ICONS[t.type];
          const content = (
            <>
              <Icon size={20} style={{ color: COLORS[t.type] }} className="mt-0.5 shrink-0" />
              <p className="text-sm text-white/90 flex-1">{t.message}</p>
            </>
          );
          return (
            <div
              key={t.id}
              className="card flex items-start gap-3 px-4 py-3 animate-[fadeIn_0.2s_ease-out]"
              style={{ borderLeft: `3px solid ${COLORS[t.type]}` }}
            >
              {t.href ? (
                <Link href={t.href} className="flex items-start gap-3 flex-1 min-w-0" onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))}>
                  {content}
                </Link>
              ) : (
                content
              )}
              <button
                onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))}
                className="text-white/40 hover:text-white/80"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast должен использоваться внутри <ToastProvider>");
  return ctx;
}
