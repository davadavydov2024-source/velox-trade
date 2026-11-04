"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { useToast } from "@/lib/toastContext";
import { Spinner } from "./ui";

type St = { id: string; label: string };

/** Вкладка «Иконка»: админ выбирает одну иконку MiliGram для всех (сайт-PWA, вкладка, новая сборка APK). */
export function AdminAppIcon() {
  const { toast } = useToast();
  const [styles, setStyles] = useState<St[] | null>(null);
  const [current, setCurrent] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    authedFetch("/api/admin/messenger/app-icon").then((r) => r.json()).then((d) => { setStyles(d.styles ?? []); setCurrent(d.current ?? ""); }).catch(() => setStyles([]));
  }, []);

  const pick = async (id: string) => {
    setBusy(id);
    try {
      const res = await authedFetch("/api/admin/messenger/app-icon", { method: "POST", body: JSON.stringify({ style: id }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Ошибка");
      setCurrent(id);
      toast("success", "Иконка выбрана");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Не удалось");
    }
    setBusy("");
  };

  if (!styles) return <div className="flex justify-center py-10"><Spinner /></div>;
  return (
    <div className="px-4 pb-8">
      <p className="mx-muted text-[13.5px] mb-3">Одна иконка MiliGram для всех. Применяется к манифесту сайта и вкладке браузера; у уже установленных приложений иконка обновится после переустановки, а в APK — после новой сборки в PWABuilder.</p>
      <div className="grid grid-cols-3 gap-3">
        {styles.map((s) => (
          <button key={s.id} disabled={!!busy} onClick={() => pick(s.id)} className="text-center active:opacity-70">
            <span className="relative block mx-auto" style={{ width: 84, height: 84 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/miligram/styles/${s.id}-192.png`} alt={s.label} width={84} height={84} className="rounded-[20px] w-full h-full" style={{ outline: current === s.id ? "3px solid var(--mx-accent)" : "none", outlineOffset: 2 }} />
              {current === s.id && <span className="absolute -right-1 -bottom-1 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "var(--mx-accent)", color: "#fff" }}><Check size={15} strokeWidth={3} /></span>}
            </span>
            <span className="block text-[13px] mt-1.5">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
