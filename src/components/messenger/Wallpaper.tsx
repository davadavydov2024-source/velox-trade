"use client";

import { useMxPrefs } from "./prefs";

export const WALLPAPERS: { id: string; label: string }[] = [
  { id: "none", label: "Классика" },
  { id: "aurora", label: "Аврора" },
  { id: "sunset", label: "Закат" },
  { id: "ocean", label: "Океан" },
  { id: "forest", label: "Лес" },
  { id: "midnight", label: "Полночь" },
  { id: "candy", label: "Сладкая вата" },
  { id: "dots", label: "Точки" },
  { id: "halloween", label: "Хеллоуин 🎃" },
];

/** Слой обоев за перепиской: лежит под всем содержимым чата (родитель — .mx-wp-host). */
export function WallpaperLayer({ id }: { id?: string }) {
  const stored = useMxPrefs((s) => s.wallpaper);
  const w = id ?? stored;
  if (!w || w === "none") return null;
  return <div className={`mx-wp-layer mx-wp mx-wp-${w}`} aria-hidden />;
}

/** Класс обоев для контейнера сообщений. */
export const wallpaperClass = (id?: string) => (id && id !== "none" ? `mx-wp mx-wp-${id}` : "");
