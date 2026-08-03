"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Disc3, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { getAllWheelPrizes } from "@/lib/wheelPrizes";
import { WheelPrize } from "@/types";
import { safeImageSrc } from "@/lib/safeImage";

interface PrizeResult {
  id: string;
  type: "product" | "balance" | "nothing";
  name: string;
  image?: string;
  balanceRub?: number;
}

const SEGMENT_COLORS = ["#1c1c24", "#26263080"]; // чередующиеся оттенки для секторов

export default function WheelPage() {
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [prizes, setPrizes] = useState<WheelPrize[]>([]);
  const [loadingPrizes, setLoadingPrizes] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<PrizeResult | null>(null);
  const [rotation, setRotation] = useState(0);
  const spinTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadPrizes();
    return () => {
      if (spinTimeout.current) clearTimeout(spinTimeout.current);
    };
  }, []);

  async function loadPrizes() {
    setLoadingPrizes(true);
    try {
      const all = await getAllWheelPrizes();
      setPrizes(all.filter((p) => p.remaining > 0));
    } catch {
      setPrizes([]);
    } finally {
      setLoadingPrizes(false);
    }
  }

  const segmentAngle = prizes.length > 0 ? 360 / prizes.length : 0;

  // Координаты для картинки/иконки каждого сектора — считаем один раз на список призов.
  const segmentPositions = useMemo(() => {
    const radius = 34; // % от центра колеса, где сидит картинка приза
    return prizes.map((_, i) => {
      const center = i * segmentAngle + segmentAngle / 2;
      const rad = ((center - 90) * Math.PI) / 180; // -90 чтобы 0° был сверху, как у conic-gradient
      return {
        left: 50 + radius * Math.cos(rad),
        top: 50 + radius * Math.sin(rad),
      };
    });
  }, [prizes, segmentAngle]);

  const wheelBackground = useMemo(() => {
    if (prizes.length === 0) return SEGMENT_COLORS[0];
    const stops = prizes
      .map((_, i) => {
        const from = i * segmentAngle;
        const to = (i + 1) * segmentAngle;
        const color = SEGMENT_COLORS[i % 2];
        return `${color} ${from}deg ${to}deg`;
      })
      .join(", ");
    return `conic-gradient(${stops})`;
  }, [prizes, segmentAngle]);

  async function handleSpin(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast("warning", "Войди в аккаунт, чтобы крутить колесо");
      return;
    }
    if (!code.trim()) {
      toast("warning", "Введи промокод для колеса");
      return;
    }
    if (prizes.length === 0) {
      toast("warning", "Колесо сейчас пустое — загляни позже");
      return;
    }

    setResult(null);
    setSpinning(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/wheel/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось прокрутить колесо");

      const prize: PrizeResult = data.prize;
      let targetIndex = prizes.findIndex((p) => p.id === prize.id);
      if (targetIndex === -1) targetIndex = 0; // приз уже не в текущем списке (редкий случай) — крутим наугад

      const centerAngle = targetIndex * segmentAngle + segmentAngle / 2;
      const targetMod = (360 - centerAngle + 360) % 360;
      const spins = 5;
      const extra = (targetMod - (rotation % 360) + 360) % 360;
      const newRotation = rotation + spins * 360 + extra;
      setRotation(newRotation);

      spinTimeout.current = setTimeout(async () => {
        setSpinning(false);
        setResult(prize);
        setCode("");
        await refreshProfile();
        loadPrizes();
      }, 4200);
    } catch (err: any) {
      setSpinning(false);
      toast("error", err.message || "Не удалось прокрутить колесо");
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-xl font-bold flex items-center justify-center gap-2">
          <Disc3 size={22} className="text-accent" /> Колесо Фортуны
        </h1>
        <p className="text-sm text-white/40 mt-1">
          Введи промокод колеса — его можно активировать раз в 24 часа и получить случайный приз.
        </p>
      </div>

      <div className="flex flex-col items-center">
        <div className="relative" style={{ width: 280, height: 280 }}>
          {/* Указатель */}
          <div
            className="absolute z-10"
            style={{
              top: -6,
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "12px solid transparent",
              borderRight: "12px solid transparent",
              borderTop: "18px solid var(--accent, #6C5CE7)",
            }}
          />
          <div
            className="rounded-full border-4 border-accent/40 relative overflow-hidden"
            style={{
              width: 280,
              height: 280,
              background: wheelBackground,
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? "transform 4.2s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
            }}
          >
            {loadingPrizes ? (
              <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm">Загрузка...</div>
            ) : prizes.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm text-center px-6">
                Колесо ещё не настроено
              </div>
            ) : (
              prizes.map((p, i) => (
                <div
                  key={p.id}
                  className="absolute w-11 h-11 -ml-[22px] -mt-[22px] rounded-full overflow-hidden bg-black/40 border border-white/10 flex items-center justify-center"
                  style={{ left: `${segmentPositions[i].left}%`, top: `${segmentPositions[i].top}%` }}
                >
                  {p.type === "product" && p.image ? (
                    <img src={safeImageSrc(p.image)} alt={p.name} className="w-full h-full object-cover" />
                  ) : p.type === "balance" ? (
                    <span className="text-base">💰</span>
                  ) : (
                    <span className="text-base">🚫</span>
                  )}
                </div>
              ))
            )}
          </div>
          {/* Центр колеса */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-accent flex items-center justify-center z-10">
            <Disc3 size={18} className="text-black" />
          </div>
        </div>

        <div className="mt-4 min-h-[70px] text-center">
          {spinning ? (
            <p className="text-sm text-white/40 animate-pulse">Крутим...</p>
          ) : result ? (
            <div className="animate-in fade-in">
              <Sparkles size={22} className="text-accent mx-auto mb-1" />
              {result.type === "nothing" ? (
                <p className="font-medium text-white/60">{result.name}</p>
              ) : (
                <>
                  <p className="font-bold">{result.name}</p>
                  {result.type === "balance" && <p className="text-accent text-xs mt-0.5">Начислено на баланс!</p>}
                  {result.type === "product" && <p className="text-accent text-xs mt-0.5">Товар уже в твоих заказах!</p>}
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <form onSubmit={handleSpin} className="flex gap-2">
        <input
            autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Промокод колеса"
          disabled={spinning}
          className="input-field py-2.5 text-sm flex-1 uppercase"
        />
        <button disabled={spinning || !code.trim()} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50">
          {spinning ? "..." : "Крутить"}
        </button>
      </form>
    </div>
  );
}
