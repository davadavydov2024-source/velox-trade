"use client";

import { useEffect, useState } from "react";
import { Download, Monitor, Smartphone } from "lucide-react";
import { IconBox } from "./ui";
import { isNativeShell } from "./env";

interface Release { version: string; windows?: { url: string; sizeMb: number }; android?: { url: string; sizeMb: number } }

/** Раздел «Приложения»: скачать установщик для Windows и APK для Android. Не показывается внутри самих приложений и пока релиза нет. */
export function AppDownloads() {
  const [rel, setRel] = useState<Release | null>(null);
  useEffect(() => {
    if (isNativeShell()) return;
    fetch("/api/messenger/app-release").then((r) => r.json()).then((d) => setRel(d.release ?? null)).catch(() => {});
  }, []);
  if (!rel || (!rel.windows && !rel.android)) return null;

  const isAndroid = /Android/i.test(navigator.userAgent);
  const items = [
    rel.windows && { key: "win", href: rel.windows.url, icon: <Monitor size={17} />, color: "#0a84ff", label: "Скачать для Windows (.exe)", size: rel.windows.sizeMb },
    rel.android && { key: "apk", href: rel.android.url, icon: <Smartphone size={17} />, color: "#34c759", label: "Скачать для Android (.apk)", size: rel.android.sizeMb },
  ].filter(Boolean) as { key: string; href: string; icon: React.ReactNode; color: string; label: string; size: number }[];
  if (isAndroid) items.sort((a) => (a.key === "apk" ? -1 : 1));

  return (
    <>
      {items.map((i) => (
        <a key={i.key} href={i.href} className="w-full flex items-center gap-3.5 px-4 py-3 text-left active:bg-white/5">
          <IconBox color={i.color}>{i.icon}</IconBox>
          <span className="flex-1 text-[16px]">{i.label}</span>
          <span className="mx-muted text-[15px]">{i.size} МБ</span>
          <Download size={18} className="mx-muted" />
        </a>
      ))}
    </>
  );
}
