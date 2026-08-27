"use client";

import { createContext, useCallback, useContext, useRef, useState, ReactNode } from "react";

export type MascotEvent = "register" | "purchase" | "sale";

interface MascotState {
  event: MascotEvent;
  key: number; // меняется при каждом вызове, чтобы можно было запустить анимацию заново подряд
}

interface MascotContextValue {
  celebrate: (event: MascotEvent) => void;
  state: MascotState | null;
  dismiss: () => void;
}

const MascotContext = createContext<MascotContextValue | null>(null);

export function MascotProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MascotState | null>(null);
  const counterRef = useRef(0);

  const celebrate = useCallback((event: MascotEvent) => {
    counterRef.current += 1;
    setState({ event, key: counterRef.current });
  }, []);

  const dismiss = useCallback(() => setState(null), []);

  return <MascotContext.Provider value={{ celebrate, state, dismiss }}>{children}</MascotContext.Provider>;
}

/** Вызывай celebrate("purchase" | "sale" | "register") в момент успешного действия — маскот появится сам. */
export function useMascot(): MascotContextValue {
  const ctx = useContext(MascotContext);
  if (!ctx) throw new Error("useMascot должен использоваться внутри MascotProvider");
  return ctx;
}
