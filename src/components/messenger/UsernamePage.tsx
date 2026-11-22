"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { mApi, MApiError } from "./api";
import { PageHeader, Spinner } from "./ui";

type HandleRes = { status: "ok" | "same" | "invalid" | "taken" | "reserved" | "bot" | "collectible"; message: string; current: string };

/** «Имя пользователя», как в Telegram: поле с @, подсказка «свободно / занято» на лету, пояснение и ссылка. */
export function UsernamePage({ onBack, onCollectibles }: { onBack: () => void; onCollectibles?: () => void }) {
  const { toast } = useToast();
  const [current, setCurrent] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [res, setRes] = useState<HandleRes | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    mApi<HandleRes>("handle").then((d) => { setCurrent(d.current); setValue(d.current); }).catch(() => toast("error", "Не удалось загрузить имя"));
  }, [toast]);

  // проверка с задержкой, чтобы не дёргать сервер на каждую букву
  useEffect(() => {
    if (current === null) return;
    const v = value.trim().toLowerCase();
    if (!v || v === current) { setRes(null); setChecking(false); return; }
    setChecking(true);
    let stale = false;
    const t = setTimeout(() => {
      mApi<HandleRes>(`handle?handle=${encodeURIComponent(v)}`).then((d) => { if (!stale) setRes(d); }).catch(() => { if (!stale) setRes(null); }).finally(() => { if (!stale) setChecking(false); });
    }, 350);
    return () => { stale = true; clearTimeout(t); };
  }, [value, current]);

  const canSave = !saving && !checking && res?.status === "ok" && value.trim().toLowerCase() !== current;

  const save = async () => {
    setSaving(true);
    try {
      const r = await mApi<{ handle: string }>("handle", { handle: value.trim().toLowerCase() });
      setCurrent(r.handle); setValue(r.handle); setRes(null);
      toast("success", `Имя пользователя изменено: @${r.handle}`);
    } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не удалось сменить имя"); }
    finally { setSaving(false); }
  };

  const link = typeof window !== "undefined" && current ? `${window.location.origin}/m?u=${current}` : "";
  const color = checking ? "var(--mx-muted)" : res?.status === "ok" ? "#34c759" : res ? "var(--mx-danger)" : "var(--mx-muted)";
  const message = checking ? "Проверяю…" : res?.message ?? "";

  return (
    <>
      <PageHeader title="Имя пользователя" onBack={onBack} right={
        <button onClick={save} disabled={!canSave} aria-label="Сохранить" style={{ color: "var(--mx-accent)", opacity: canSave ? 1 : 0.35 }}>
          {saving ? <Spinner size={20} /> : <Check size={26} />}
        </button>
      } />
      <div className="mx-scroll flex-1 pb-24 pt-3">
        {current === null ? <div className="flex justify-center py-10"><Spinner /></div> : (
          <>
            <div className="mx-card flex items-center px-4" style={{ margin: "0 16px" }}>
              <span className="text-[17px] mx-muted">@</span>
              <input className="bg-transparent outline-none flex-1 min-w-0 py-3.5 text-[17px] ml-0.5" value={value} maxLength={24} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="username"
                onChange={(e) => setValue(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} />
              {checking && <Spinner size={16} />}
            </div>
            <p className="px-8 mt-2 text-[13.5px] min-h-[20px]" style={{ color }}>{message}</p>
            <p className="mx-muted text-[13.5px] px-8 mt-2">
              Вы можете выбрать публичное имя пользователя. Тогда вас смогут найти и написать вам, не зная номера. Используйте a–z, 0–9 и подчёркивания. Минимальная длина — 4 символа.
            </p>
            {link && (
              <>
                <p className="mx-muted text-[13.5px] px-8 mt-4">Эта ссылка открывает чат с вами:</p>
                <button className="mx-card flex items-center gap-2 px-4 py-3 text-left" style={{ margin: "6px 16px 0", width: "calc(100% - 32px)" }}
                  onClick={() => { try { navigator.clipboard.writeText(link); toast("success", "Ссылка скопирована"); } catch { toast("info", link); } }}>
                  <span className="flex-1 min-w-0 truncate text-[15px]" style={{ color: "var(--mx-accent)" }}>{link}</span>
                  <Copy size={17} className="mx-muted shrink-0" />
                </button>
              </>
            )}
            {onCollectibles && (
              <button className="mx-card block text-left px-4 py-3 text-[16px]" style={{ margin: "20px 16px 0", width: "calc(100% - 32px)", color: "var(--mx-accent)" }} onClick={onCollectibles}>
                Коллекционные юзернеймы
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
