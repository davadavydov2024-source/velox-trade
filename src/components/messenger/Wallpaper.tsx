"use client";

import { useMxPrefs } from "./prefs";

/** Слой обоев за перепиской: лежит под всем содержимым чата (родитель — .mx-wp-host). */
export function WallpaperLayer() {
  const id = useMxPrefs((s) => s.wallpaper);
  if (!id || id === "none") return null;
  return <div className={`mx-wp-layer mx-wp-${id}`} aria-hidden />;
}

/** Плитка-превью обоев для настроек. */
export function WallpaperPreview({ id }: { id: string }) {
  return <div className={`mx-wp-layer mx-wp-prev mx-wp-${id || "none"}`} aria-hidden />;
}
