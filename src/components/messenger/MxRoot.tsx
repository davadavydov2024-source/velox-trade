"use client";

import { ReactNode, useEffect, useState } from "react";
import { useViewportHeight } from "./hooks";
import { useMxPrefs } from "./prefs";
import "./messenger.css";

/** Корень мессенджера: на весь экран поверх сайта (Header и нижняя панель сайта скрыты), тема, акцент, размер текста. */
export function MxRoot({ children }: { children: ReactNode }) {
  useViewportHeight();
  const theme = useMxPrefs((s) => s.theme);
  const accent = useMxPrefs((s) => s.accent);
  const textSize = useMxPrefs((s) => s.textSize);
  const [systemDark, setSystemDark] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const h = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  const resolved = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  // цвет строки состояния iOS/Android под тему
  useEffect(() => {
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    const prev = meta.content;
    meta.content = resolved === "dark" ? "#0b0b0d" : "#f2f2f6";
    return () => {
      if (meta) meta.content = prev;
    };
  }, [resolved]);

  const style: Record<string, string> = { "--vc-font": `${textSize}px` };
  if (accent) style["--vc-accent"] = accent;

  return (
    <div id="vc-root" className="vc vc-root" data-theme={mounted ? resolved : "dark"} style={style as React.CSSProperties}>
      {children}
    </div>
  );
}
