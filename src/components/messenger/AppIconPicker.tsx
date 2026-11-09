"use client";

import { useEffect, useState } from "react";
import { Check, Download } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { PageHeader } from "./ui";
import { USER_ICON_STYLES, applyIcon, getInstallPrompt, getSavedIcon } from "./appIconPref";

/** «Иконка приложения»: пользователь выбирает вариант и ставит MiliGram на главный экран с ним. */
export function AppIconPicker({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [cur, setCur] = useState("classic");
  useEffect(() => { setCur(getSavedIcon() ?? "classic"); }, []);

  const pick = (id: string) => { setCur(id); applyIcon(id); };

  const install = async () => {
    applyIcon(cur);
    const ev = getInstallPrompt();
    if (!ev) {
      toast("info", "Откройте меню браузера ⋮ → «Установить приложение» или «Добавить на главный экран»");
      return;
    }
    try { await ev.prompt(); } catch {}
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Иконка приложения" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <p className="mx-muted text-[13.5px] mb-3">Выберите иконку и установите MiliGram на главный экран — она будет именно такой. Если приложение уже установлено, удалите его и поставьте заново. Иконка в скачанном APK не меняется.</p>
        <div className="grid grid-cols-3 gap-3">
          {USER_ICON_STYLES.map((s) => (
            <button key={s.id} onClick={() => pick(s.id)} className="text-center active:opacity-70">
              <span className="relative block mx-auto" style={{ width: 84, height: 84 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/miligram/styles/${s.id}-192.png`} alt={s.label} width={84} height={84} className="rounded-[20px] w-full h-full" style={{ outline: cur === s.id ? "3px solid var(--mx-accent)" : "none", outlineOffset: 2 }} />
                {cur === s.id && <span className="absolute -right-1 -bottom-1 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "var(--mx-accent)", color: "#fff" }}><Check size={15} strokeWidth={3} /></span>}
              </span>
              <span className="block text-[13px] mt-1.5">{s.label}</span>
            </button>
          ))}
        </div>
        <button onClick={install} className="mt-6 w-full flex items-center justify-center gap-2 rounded-xl py-3 font-medium" style={{ background: "var(--mx-accent)", color: "#fff" }}>
          <Download size={18} /> Установить с этой иконкой
        </button>
      </div>
    </div>
  );
}
