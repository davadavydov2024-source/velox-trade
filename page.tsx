"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, X, Ticket } from "lucide-react";
import { getCaseById, getCaseItemRarity } from "@/lib/cases";
import { RARITY_COLOR } from "@/lib/rarityColors";
import { safeImageSrc } from "@/lib/safeImage";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { CaseData, CaseItem, Rarity, RARITY_LABEL } from "@/types";
import { WheelConfetti } from "@/components/WheelConfetti";

const CELL_WIDTH = 96; // px — ширина одной ячейки рулетки, включая отступ
const STRIP_LENGTH = 40; // сколько ячеек показываем прокруткой
const TARGET_INDEX = 34; // на каком по счёту месте в ленте стоит реальный выигрыш
const SPIN_DURATION_MS = 4200;

type WonResult = { item: { id: string; name: string; image: string }; orderId: string };

function pickRandomCosmetic(items: CaseItem[]): CaseItem {
  return items[Math.floor(Math.random() * items.length)];
}

export default function CaseOpenPage() {
  const { id } = useParams<{ id: string }>();
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();

  const [caseData, setCaseData] = useState<CaseData | null | undefined>(undefined);
  const [opening, setOpening] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [won, setWon] = useState<WonResult | null>(null);
  const [strip, setStrip] = useState<CaseItem[]>([]);
  const [translateX, setTranslateX] = useState(0);
  const [transitionOn, setTransitionOn] = useState(false);
  const [landedRarity, setLandedRarity] = useState<Rarity | null>(null);
  const trackWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getCaseById(id).then(setCaseData);
  }, [id]);

  const totalWeight = caseData ? caseData.items.reduce((s, it) => s + it.weight, 0) : 0;

  async function handleOpen() {
    if (!user) return toast("warning", "Сначала войди в аккаунт");
    if (!caseData || caseData.items.length === 0) return;
    if ((profile?.ticketBalance ?? 0) < caseData.priceTickets) return toast("warning", "Недостаточно тикетов");

    setOpening(true);
    setLandedRarity(null);
    try {
      // Результат честно определяется сервером ДО того, как на экране что-то закрутится —
      // анимация ниже только откладывает показ уже готового результата ради саспенса, она не
      // влияет на исход и не может быть "подкручена" на клиенте.
      const idToken = await user.getIdToken();
      const res = await fetch("/api/cases/open", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ caseId: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error || "Не удалось открыть кейс");
        setOpening(false);
        return;
      }
      await refreshProfile();

      const wonPrizeStub: CaseItem = { id: data.item.id, productId: "", name: data.item.name, image: data.item.image, weight: 0 };
      const items = caseData.items;
      const built: CaseItem[] = Array.from({ length: STRIP_LENGTH }, (_, i) => (i === TARGET_INDEX ? wonPrizeStub : pickRandomCosmetic(items)));
      setStrip(built);
      setTransitionOn(false);
      setTranslateX(0);
      setSpinning(true);

      // Двойной requestAnimationFrame — даём браузеру отрисовать ленту в стартовой позиции
      // ДО того, как включим CSS-transition, иначе рулетка либо не поедет, либо дёрнется рывком.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const containerWidth = trackWrapRef.current?.clientWidth ?? 0;
          const jitter = (Math.random() - 0.5) * (CELL_WIDTH * 0.5);
          const target = TARGET_INDEX * CELL_WIDTH + CELL_WIDTH / 2 - containerWidth / 2 + jitter;
          setTransitionOn(true);
          setTranslateX(-target);
        });
      });

      setTimeout(() => {
        setSpinning(false);
        setOpening(false);
        setWon({ item: data.item, orderId: data.orderId });
        const originalItem = caseData.items.find((it) => it.id === data.item.id);
        if (originalItem) setLandedRarity(getCaseItemRarity(originalItem.weight, totalWeight));
      }, SPIN_DURATION_MS);
    } catch {
      toast("error", "Не удалось открыть кейс");
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

  const canAfford = (profile?.ticketBalance ?? 0) >= caseData.priceTickets;
  const sortedItems = [...caseData.items].sort((a, b) => a.weight - b.weight); // редкие (маленький вес) — первыми

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/case" className="text-sm text-white/40 hover:text-white flex items-center gap-1.5 mb-4">
        <ArrowLeft size={14} /> Ко всем кейсам
      </Link>

      <div className="card p-6 text-center mb-6 relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(circle at 50% 20%, rgba(255,152,0,0.12), transparent 60%)" }}
        />
        <div className="relative w-28 h-28 mx-auto mb-3">
          <div className="absolute inset-0 rounded-full blur-2xl opacity-50" style={{ background: "var(--color-accent)" }} />
          <img src={safeImageSrc(caseData.image)} alt={caseData.name} className="relative w-full h-full rounded-btn object-cover" />
        </div>
        <h1 className="text-xl font-bold mb-1 relative">{caseData.name}</h1>
        <p className="text-accent font-bold text-lg mb-4 relative flex items-center justify-center gap-1.5">
          {caseData.priceTickets} <Ticket size={18} />
        </p>

        {spinning && (
          <div ref={trackWrapRef} className="relative h-24 overflow-hidden rounded-btn bg-black/30 mb-4">
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-accent z-10 -translate-x-1/2 shadow-[0_0_12px_var(--color-accent)]" />
            <div className="absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-black/70 to-transparent z-10" />
            <div className="absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-black/70 to-transparent z-10" />
            <div
              className="flex h-full items-center"
              style={{
                transform: `translateX(${translateX}px)`,
                transition: transitionOn ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.1, 0, 0.15, 1)` : "none",
              }}
            >
              {strip.map((it, i) => {
                const original = caseData.items.find((ci) => ci.id === it.id);
                const rarity = original ? getCaseItemRarity(original.weight, totalWeight) : "legendary";
                return (
                  <div key={i} className="shrink-0 flex flex-col items-center justify-center" style={{ width: CELL_WIDTH }}>
                    <div className="w-14 h-14 rounded-btn overflow-hidden bg-black/30" style={{ boxShadow: `0 2px 0 0 ${RARITY_COLOR[rarity]}` }}>
                      <img src={safeImageSrc(it.image)} alt="" className="w-full h-full object-cover" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={handleOpen}
          disabled={opening || caseData.items.length === 0 || !user || !canAfford}
          className="relative btn-primary px-8 py-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {opening ? (
            <>
              <Loader2 size={16} className="animate-spin" /> {spinning ? "Крутим..." : "Открываем..."}
            </>
          ) : !user ? (
            "Войди, чтобы открыть"
          ) : !canAfford ? (
            "Недостаточно тикетов"
          ) : (
            <>Открыть за {caseData.priceTickets} 🎫</>
          )}
        </button>
        {user && (
          <p className="text-xs text-white/30 mt-2 relative">
            Баланс: {(profile?.ticketBalance ?? 0).toFixed(0)} 🎫 ·{" "}
            <Link href="/profile/tickets" className="underline hover:text-white/50">
              получить ещё
            </Link>
          </p>
        )}
      </div>

      <p className="text-sm font-medium mb-2">Что можно выбить</p>
      {caseData.items.length === 0 ? (
        <p className="text-sm text-white/30">Призы ещё не добавлены.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {sortedItems.map((it) => {
            const rarity = getCaseItemRarity(it.weight, totalWeight);
            return (
              <div key={it.id} className="card p-3 text-center" style={{ borderTop: `2px solid ${RARITY_COLOR[rarity]}` }}>
                <img src={safeImageSrc(it.image)} alt={it.name} className="w-14 h-14 rounded-btn object-cover bg-black/30 mx-auto mb-2" />
                <p className="text-xs font-medium truncate">{it.name}</p>
                <p className="text-[11px] font-medium" style={{ color: RARITY_COLOR[rarity] }}>
                  {RARITY_LABEL[rarity]}
                </p>
                <p className="text-[10px] text-white/30">~{totalWeight > 0 ? ((it.weight / totalWeight) * 100).toFixed(1) : "0"}%</p>
              </div>
            );
          })}
        </div>
      )}

      {won && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setWon(null)}>
          <div className="card p-6 max-w-xs w-full text-center relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {landedRarity && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(circle at 50% 30%, ${RARITY_COLOR[landedRarity]}33, transparent 65%)` }}
              />
            )}
            <WheelConfetti key={won.item.id} />
            <button onClick={() => setWon(null)} className="absolute top-3 right-3 text-white/40 hover:text-white z-10">
              <X size={18} />
            </button>
            <p className="text-sm text-white/40 mb-3 relative">Тебе выпало:</p>
            <img src={safeImageSrc(won.item.image)} alt={won.item.name} className="w-28 h-28 rounded-btn object-cover bg-black/30 mx-auto mb-3 relative" />
            <p className="font-bold mb-1 relative">{won.item.name}</p>
            {landedRarity && (
              <p className="text-sm font-semibold mb-4 relative" style={{ color: RARITY_COLOR[landedRarity] }}>
                {RARITY_LABEL[landedRarity]}
              </p>
            )}
            <p className="text-xs text-white/40 mb-4 relative">Заказ оформлен — заберёшь в «Мои заказы», как обычную покупку.</p>
            <div className="flex gap-2 relative">
              <Link href="/profile/orders" className="btn-secondary flex-1 py-2.5 text-sm">
                Мои заказы
              </Link>
              <button
                onClick={() => {
                  setWon(null);
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
