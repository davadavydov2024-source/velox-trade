"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { getCaseById } from "@/lib/cases";
import { safeImageSrc } from "@/lib/safeImage";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { CaseData, CaseItem } from "@/types";

export default function CaseOpenPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();

  const [caseData, setCaseData] = useState<CaseData | null | undefined>(undefined);
  const [opening, setOpening] = useState(false);
  const [wonItem, setWonItem] = useState<CaseItem | null>(null);

  useEffect(() => {
    getCaseById(id).then(setCaseData);
  }, [id]);

  async function handleOpen() {
    if (!user) {
      toast("warning", "Сначала войди в аккаунт");
      return;
    }
    if (!caseData) return;
    if ((profile?.balance ?? 0) < caseData.price) {
      toast("warning", "Недостаточно средств на балансе");
      return;
    }
    setOpening(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/cases/open", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ caseId: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error || "Не удалось открыть кейс");
        return;
      }
      setWonItem(data.item);
      await refreshProfile();
    } catch {
      toast("error", "Не удалось открыть кейс");
    } finally {
      setOpening(false);
    }
  }

  if (caseData === undefined) {
    return <div className="max-w-2xl mx-auto px-4 py-10 text-center text-white/40">Загрузка...</div>;
  }
  if (caseData === null) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 text-center">
        <p className="text-white/40 mb-4">Кейс не найден.</p>
        <Link href="/case" className="btn-secondary px-4 py-2 inline-flex items-center gap-2">
          <ArrowLeft size={16} /> Ко всем кейсам
        </Link>
      </div>
    );
  }

  const totalWeight = caseData.items.reduce((s, it) => s + it.weight, 0);
  const canAfford = (profile?.balance ?? 0) >= caseData.price;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/case" className="text-sm text-white/40 hover:text-white flex items-center gap-1.5 mb-4">
        <ArrowLeft size={14} /> Ко всем кейсам
      </Link>

      <div className="card p-6 text-center mb-6">
        <img src={safeImageSrc(caseData.image)} alt={caseData.name} className="w-32 h-32 rounded-btn object-cover bg-black/30 mx-auto mb-3" />
        <h1 className="text-xl font-bold mb-1">{caseData.name}</h1>
        <p className="text-accent font-bold text-lg mb-4">{caseData.price} ₽</p>

        <button
          onClick={handleOpen}
          disabled={opening || caseData.items.length === 0 || !user || !canAfford}
          className="btn-primary px-8 py-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {opening ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Открываем...
            </>
          ) : !user ? (
            "Войди, чтобы открыть"
          ) : !canAfford ? (
            "Недостаточно средств"
          ) : (
            `Открыть за ${caseData.price} ₽`
          )}
        </button>
        {user && <p className="text-xs text-white/30 mt-2">Баланс: {(profile?.balance ?? 0).toFixed(2)} ₽</p>}
      </div>

      <p className="text-sm font-medium mb-2">Что можно выбить</p>
      {caseData.items.length === 0 ? (
        <p className="text-sm text-white/30">Предметы ещё не добавлены.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {caseData.items.map((it) => (
            <div key={it.id} className="card p-3 text-center">
              <img src={safeImageSrc(it.image)} alt={it.name} className="w-14 h-14 rounded-btn object-cover bg-black/30 mx-auto mb-2" />
              <p className="text-xs font-medium truncate">{it.name}</p>
              <p className="text-[11px] text-accent">{it.value} ₽</p>
              <p className="text-[10px] text-white/30">~{totalWeight > 0 ? ((it.weight / totalWeight) * 100).toFixed(1) : "0"}%</p>
            </div>
          ))}
        </div>
      )}

      {wonItem && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setWonItem(null)}>
          <div className="card p-6 max-w-xs w-full text-center relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setWonItem(null)} className="absolute top-3 right-3 text-white/40 hover:text-white">
              <X size={18} />
            </button>
            <p className="text-sm text-white/40 mb-3">Тебе выпало:</p>
            <img src={safeImageSrc(wonItem.image)} alt={wonItem.name} className="w-28 h-28 rounded-btn object-cover bg-black/30 mx-auto mb-3" />
            <p className="font-bold mb-1">{wonItem.name}</p>
            <p className="text-accent font-bold text-lg mb-4">+{wonItem.value} ₽ на баланс</p>
            <div className="flex gap-2">
              <button onClick={() => setWonItem(null)} className="btn-secondary flex-1 py-2.5 text-sm">
                Закрыть
              </button>
              <button
                onClick={() => {
                  setWonItem(null);
                  handleOpen();
                }}
                disabled={!canAfford}
                className="btn-primary flex-1 py-2.5 text-sm disabled:opacity-40"
              >
                Открыть ещё
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
