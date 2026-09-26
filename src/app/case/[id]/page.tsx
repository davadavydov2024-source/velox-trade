"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { getCaseById } from "@/lib/cases";
import { safeImageSrc } from "@/lib/safeImage";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { CaseData, CaseItem } from "@/types";

const CELL_WIDTH = 96; // px — ширина одной ячейки рулетки, включая отступ
const STRIP_LENGTH = 40; // сколько ячеек показываем прокруткой
const TARGET_INDEX = 34; // на каком по счёту месте в ленте стоит реальный выигрыш
const SPIN_DURATION_MS = 4200;

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
  const [wonItem, setWonItem] = useState<CaseItem | null>(null);
  const [strip, setStrip] = useState<CaseItem[]>([]);
  const [translateX, setTranslateX] = useState(0);
  const [transitionOn, setTransitionOn] = useState(false);
  const trackWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getCaseById(id).then(setCaseData);
  }, [id]);

  async function handleOpen() {
    if (!user) return toast("warning", "Сначала войди в аккаунт");
    if (!caseData || caseData.items.length === 0) return;
    if ((profile?.balance ?? 0) < caseData.price) return toast("warning", "Недостаточно средств на балансе");

    setOpening(true);
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

      const won: CaseItem = data.item;
      const items = caseData.items;
      const built: CaseItem[] = Array.from({ length: STRIP_LENGTH }, (_, i) => (i === TARGET_INDEX ? won : pickRandomCosmetic(items)));
      setStrip(built);
      setTransitionOn(false);
      setTranslateX(0);
      setSpinning(true);

      // Двойной requestAnimationFrame — даём браузеру отрисовать ленту в стартовой позиции
      // (translateX: 0) ДО того, как включим CSS-transition, иначе он может "слипнуться" со
      // сбросом и рулетка либо не поедет, либо дёрнется без анимации.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const containerWidth = trackWrapRef.current?.clientWidth ?? 0;
          // Небольшой случайный сдвиг внутри ячейки — чтобы указатель не всегда останавливался
          // ровно по центру предмета, как в настоящих рулетках кейсов.
          const jitter = (Math.random() - 0.5) * (CELL_WIDTH * 0.5);
          const target = TARGET_INDEX * CELL_WIDTH + CELL_WIDTH / 2 - containerWidth / 2 + jitter;
          setTransitionOn(true);
          setTranslateX(-target);
        });
      });

      setTimeout(() => {
        setSpinning(false);
        setOpening(false);
        setWonItem(won);
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

  const totalWeight = caseData.items.reduce((s, it) => s + it.weight, 0);
  const canAfford = (profile?.balance ?? 0) >= caseData.price;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/case" className="text-sm text-white/40 hover:text-white flex items-center gap-1.5 mb-4">
        <ArrowLeft size={14} /> Ко всем кейсам
      </Link>

      <div className="card p-6 text-center mb-6">
        <img src={safeImageSrc(caseData.image)} alt={caseData.name} className="w-24 h-24 rounded-btn object-cover bg-black/30 mx-auto mb-3" />
        <h1 className="text-xl font-bold mb-1">{caseData.name}</h1>
        <p className="text-accent font-bold text-lg mb-4">{caseData.price} ₽</p>

        {spinning && (
          <div ref={trackWrapRef} className="relative h-24 overflow-hidden rounded-btn bg-black/30 mb-4">
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-accent z-10 -translate-x-1/2" />
            <div className="absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-black/60 to-transparent z-10" />
            <div className="absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-black/60 to-transparent z-10" />
            <div
              className="flex h-full items-center"
              style={{
                transform: `translateX(${translateX}px)`,
                transition: transitionOn ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.1, 0, 0.15, 1)` : "none",
              }}
            >
              {strip.map((it, i) => (
                <div key={i} className="shrink-0 flex flex-col items-center justify-center" style={{ width: CELL_WIDTH }}>
                  <img src={safeImageSrc(it.image)} alt="" className="w-14 h-14 rounded-btn object-cover bg-black/30" />
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleOpen}
          disabled={opening || caseData.items.length === 0 || !user || !canAfford}
          className="btn-primary px-8 py-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {opening ? (
            <>
              <Loader2 size={16} className="animate-spin" /> {spinning ? "Крутим..." : "Открываем..."}
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
