"use client";

import { useState } from "react";
import { authedFetch } from "@/lib/authedFetch";
import { useToast } from "@/lib/toastContext";
import { Sheet, Spinner } from "./ui";

/** Ввод промокода: даёт Mili Premium на несколько дней. */
export function PromoSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy || code.trim().length < 4) return;
    setBusy(true);
    try {
      const r = await authedFetch("/api/messenger/promo", { method: "POST", body: JSON.stringify({ code }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Не удалось активировать");
      toast("success", `Готово! Mili Premium +${d.days} дн. ✨`);
      setCode(""); onClose();
    } catch (e: any) { toast("error", e.message); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Промокод">
      <div className="px-4 pb-8 flex flex-col gap-3">
        <p className="mx-muted text-[14px]">Введи промокод от администрации — получишь Mili Premium на несколько дней.</p>
        <input className="mx-input" placeholder="КОД" autoCapitalize="characters" maxLength={32} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && go()} style={{ letterSpacing: 2, textAlign: "center", fontWeight: 600 }} />
        <button className="mx-btn" disabled={busy || code.trim().length < 4} onClick={go}>{busy ? <Spinner size={18} /> : "Активировать"}</button>
      </div>
    </Sheet>
  );
}
