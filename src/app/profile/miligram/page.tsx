"use client";

import { useEffect, useState } from "react";
import { Link2, Copy } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { useToast } from "@/lib/toastContext";

type Status = { telegramLinked: boolean; linked: boolean; banned: boolean; badge: string | null };

export default function MiliGramLinkPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    authedFetch("/api/miligram/link").then((r) => r.json()).then(setStatus).catch(() => {});
  }, []);

  async function getCode() {
    setBusy(true);
    try {
      const res = await authedFetch("/api/miligram/link", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCode(data.code);
    } catch (e: any) {
      toast("error", e?.message || "Не удалось получить код");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 max-w-lg">
      <h1 className="text-xl font-bold flex items-center gap-2"><Link2 size={20} className="text-accent" /> MiliGram</h1>
      <p className="text-sm text-white/40">Привяжи приложение MiliGram к аккаунту Velox Trade: бейджи и оформление профиля будут видны другим пользователям мода.</p>
      {status?.banned && <div className="card p-4 text-sm text-red-300">Доступ к MiliGram для этого аккаунта закрыт.</div>}
      {status && !status.telegramLinked && <div className="card p-4 text-sm text-yellow-300">Сначала привяжи Telegram к аккаунту Velox.</div>}
      {status?.linked && <div className="card p-4 text-sm text-green-300">Приложение привязано{status.badge ? ` · бейдж: ${status.badge}` : ""}. Новый код нужен только для другого устройства.</div>}
      <div className="card p-5 space-y-3">
        <button onClick={getCode} disabled={busy || status?.banned || status?.telegramLinked === false} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-40">
          {busy ? "..." : "Получить код привязки"}
        </button>
        {code && (
          <div className="flex items-center gap-3">
            <span className="text-2xl font-mono font-bold tracking-widest">{code}</span>
            <button onClick={() => { navigator.clipboard?.writeText(code.replace("-", "")); toast("success", "Скопировано"); }} className="text-white/50 hover:text-white"><Copy size={16} /></button>
          </div>
        )}
        {code && <p className="text-xs text-white/40">Введи код в MiliGram: Настройки → Velox Trade. Действует 10 минут, одноразовый.</p>}
      </div>
    </div>
  );
}
