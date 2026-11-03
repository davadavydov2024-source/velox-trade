"use client";

import { ReactNode, useEffect, useState } from "react";
import { useViewportHeight } from "./hooks";
import { FONT_CHOICES, useMxPrefs } from "./prefs";
import "./messenger.css";

/** Корень мессенджера: на весь экран поверх сайта (Header и нижняя панель сайта скрыты), тема, акцент, размер текста. */
export function MxRoot({ children }: { children: ReactNode }) {
  useViewportHeight();
  const theme = useMxPrefs((s) => s.theme);
  const accent = useMxPrefs((s) => s.accent);
  const textSize = useMxPrefs((s) => s.textSize);
  const bubbleStyle = useMxPrefs((s) => s.bubbleStyle);
  const fontId = useMxPrefs((s) => s.font);
  const fontDef = FONT_CHOICES.find((f) => f.id === fontId);

  // веб-шрифт подгружаем только когда он выбран
  useEffect(() => {
    if (!fontDef?.google) return;
    const id = `mx-font-${fontDef.id}`;
    if (document.getElementById(id)) return;
    const l = document.createElement("link");
    l.id = id;
    l.rel = "stylesheet";
    l.href = `https://fonts.googleapis.com/css2?family=${fontDef.google}&subset=cyrillic&display=swap`;
    document.head.appendChild(l);
  }, [fontDef]);
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
    meta.content = resolved === "dark" ? (accent ? "#0b0b0d" : "#17212b") : (accent ? "#f2f2f6" : "#ffffff");
    return () => {
      if (meta) meta.content = prev;
    };
  }, [resolved, accent]);

  const style: Record<string, string> = { "--mx-font": `${textSize}px` };
  if (accent) style["--mx-accent"] = accent;
  if (fontDef?.css) style.fontFamily = fontDef.css;

  return (
    <div id="mx-root" className="mx mx-root" data-theme={mounted ? resolved : "dark"} data-design="tg" data-bubble={bubbleStyle} data-accent={accent ? "custom" : undefined} style={style as React.CSSProperties}>
      {children}
    </div>
  );
}
