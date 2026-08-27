"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Disc3, Sparkles, MessageCircle } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { getAllWheelPrizes } from "@/lib/wheelPrizes";
import { getProductById } from "@/lib/products";
import { RARITY_COLOR } from "@/lib/rarityColors";
import { WheelPrize } from "@/types";
import { safeImageSrc } from "@/lib/safeImage";
import { WheelConfetti } from "@/components/WheelConfetti";

interface PrizeResult {
  id: string;
  type: "product" | "balance" | "nothing";
  name: string;
  image?: string;
  balanceRub?: number;
  orderId?: string;
}

const NON_PRODUCT_COLOR: Record<"balance" | "nothing", string> = { balance: "#4ade80", nothing: "#5b6272" };
const WHEEL_SIZE = 300;
const BULB_COUNT = 20;
// Держим в синхроне с COOLDOWN_MS на сервере (src/app/api/wheel/spin/route.ts) — используется
// только для отображения таймера на клиенте, реальная проверка всегда идёт на сервере.
const WHEEL_COOLDOWN_MS = 7 * 60 * 60 * 1000;

function formatCooldown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м ${s}с`;
  return `${s}с`;
}

export default function WheelPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [prizes, setPrizes] = useState<WheelPrize[]>([]);
  const [loadingPrizes, setLoadingPrizes] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<PrizeResult | null>(null);
  const [rotation, setRotation] = useState(0);
  const [prizeRarity, setPrizeRarity] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const spinTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Тикает раз в секунду, только пока реально идёт отсчёт кулдауна — используется для видимого
  // таймера "следующая попытка через". Раньше такого таймера не было вовсе: пользователь узнавал
  // о кулдауне только из текста ошибки после нажатия "Крутить".
  useEffect(() => {
    const cooldownEndsAt = (profile?.lastWheelSpinAt ?? 0) + WHEEL_COOLDOWN_MS;
    if (cooldownEndsAt <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [profile?.lastWheelSpinAt]);

  const cooldownMsLeft = Math.max(0, (profile?.lastWheelSpinAt ?? 0) + WHEEL_COOLDOWN_MS - now);
  const onCooldown = cooldownMsLeft > 0;

  useEffect(() => {
    loadPrizes();
    return () => {
      if (spinTimeout.current) clearTimeout(spinTimeout.current);
    };
  }, []);

  useEffect(() => {
    const productPrizes = prizes.filter((p) => p.type === "product" && p.productId);
    Promise.all(
      productPrizes.map((p) =>
        getProductById(p.productId!)
          .then((prod) => [p.id, prod?.rarity ?? "common"] as const)
          .catch(() => [p.id, "common"] as const)
      )
    ).then((entries) => setPrizeRarity(Object.fromEntries(entries)));
  }, [prizes]);

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
    if (prizes.length === 0) return "#14141c";

    function mixWithDark(hex: string, amount: number): string {
      const dark = { r: 20, g: 20, b: 28 };
      const c = hex.replace("#", "");
      const r = parseInt(c.substring(0, 2), 16);
      const g = parseInt(c.substring(2, 4), 16);
      const b = parseInt(c.substring(4, 6), 16);
      const mr = Math.round(r * amount + dark.r * (1 - amount));
      const mg = Math.round(g * amount + dark.g * (1 - amount));
      const mb = Math.round(b * amount + dark.b * (1 - amount));
      return `rgb(${mr}, ${mg}, ${mb})`;
    }

    // Цвет сектора берём из редкости приза (легендарки — оранжевые, эпики — фиолетовые и т.д.) —
    // чётные/нечётные сектора чуть темнее/светлее, чтобы соседние сектора одной редкости отличались.
    function colorFor(p: WheelPrize, i: number): string {
      const base = p.type === "product" ? RARITY_COLOR[prizeRarity[p.id] ?? "common"] ?? RARITY_COLOR.common : NON_PRODUCT_COLOR[p.type];
      return mixWithDark(base, i % 2 === 0 ? 0.55 : 0.38);
    }

    // Тонкая светлая полоска между секторами — визуально разделяет их, как спицы у настоящего колеса.
    const lineWidth = Math.min(1.6, segmentAngle * 0.12);
    const stops: string[] = [];
    prizes.forEach((p, i) => {
      const from = i * segmentAngle;
      const to = (i + 1) * segmentAngle;
      stops.push(`${colorFor(p, i)} ${from + lineWidth / 2}deg ${to - lineWidth / 2}deg`);
      stops.push(`rgba(255,255,255,0.45) ${to - lineWidth / 2}deg ${to + lineWidth / 2}deg`);
    });
    return `conic-gradient(${stops.join(", ")})`;
  }, [prizes, segmentAngle, prizeRarity]);

  async function handleSpin(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast("warning", "Войди в аккаунт, чтобы крутить колесо");
      return;
    }
    if (onCooldown) {
      toast("warning", `Ещё рано — следующая попытка через ${formatCooldown(cooldownMsLeft)}`);
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

      const prize: PrizeResult = { ...data.prize, orderId: data.orderId };
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
          Введи промокод колеса — его можно активировать раз в 7 часов и получить случайный приз.
        </p>
      </div>

      <div className="flex flex-col items-center">
        <div className="relative" style={{ width: WHEEL_SIZE + 44, height: WHEEL_SIZE + 44 }}>
          {/* Мягкое дышащее свечение позади колеса */}
          <div
            className="wheel-ambient-glow absolute rounded-full pointer-events-none"
            style={{
              inset: 0,
              background: "radial-gradient(circle, var(--accent, #6C5CE7)55 0%, transparent 70%)",
              filter: "blur(18px)",
            }}
          />

          {/* Кольцо лампочек по кругу, как у настоящего карнавального колеса */}
          {Array.from({ length: BULB_COUNT }).map((_, i) => {
            const angle = (i / BULB_COUNT) * 360;
            const rad = (angle * Math.PI) / 180;
            const r = (WHEEL_SIZE + 34) / 2;
            const bulbColor = i % 2 === 0 ? "#ffd76b" : "#ff8fb1";
            return (
              <span
                key={i}
                className={`wheel-bulb absolute w-2 h-2 rounded-full ${spinning ? "spinning" : ""}`}
                style={{
                  left: `calc(50% + ${r * Math.sin(rad)}px - 4px)`,
                  top: `calc(50% - ${r * Math.cos(rad)}px - 4px)`,
                  background: bulbColor,
                  color: bulbColor,
                  animationDelay: `${(i % 5) * 0.15}s`,
                }}
              />
            );
          })}

          {/* Указатель */}
          <div
            className={`absolute z-20 origin-top ${spinning ? "wheel-pointer-spinning" : ""}`}
            style={{ top: 2, left: "50%", transform: "translateX(-50%)" }}
          >
            <div
              style={{
                width: 0,
                height: 0,
                borderLeft: "13px solid transparent",
                borderRight: "13px solid transparent",
                borderTop: "20px solid var(--accent, #6C5CE7)",
                filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
              }}
            />
            <div className="w-3.5 h-3.5 rounded-full bg-accent mx-auto -mt-1 shadow-[0_0_10px_var(--accent,#6C5CE7)]" />
          </div>

          <div
            className="absolute rounded-full border-[3px] border-accent/50 overflow-hidden shadow-[0_0_40px_-8px_var(--accent,#6C5CE7)]"
            style={{
              width: WHEEL_SIZE,
              height: WHEEL_SIZE,
              left: 22,
              top: 22,
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
              prizes.map((p, i) => {
                const ringColor = p.type === "product" ? RARITY_COLOR[prizeRarity[p.id] ?? "common"] ?? RARITY_COLOR.common : NON_PRODUCT_COLOR[p.type];
                return (
                  <div
                    key={p.id}
                    className="absolute w-12 h-12 -ml-6 -mt-6 rounded-full overflow-hidden bg-black/50 flex items-center justify-center shadow-lg"
                    style={{ left: `${segmentPositions[i].left}%`, top: `${segmentPositions[i].top}%`, border: `2px solid ${ringColor}` }}
                  >
                    {p.type === "product" && p.image ? (
                      <img src={safeImageSrc(p.image)} alt={p.name} className="w-full h-full object-cover" />
                    ) : p.type === "balance" ? (
                      <span className="text-lg">💰</span>
                    ) : (
                      <span className="text-lg">🚫</span>
                    )}
                  </div>
                );
              })
            )}
            {/* Стеклянный блик поверх колеса — глубина и объём */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: "radial-gradient(ellipse 70% 45% at 30% 20%, rgba(255,255,255,0.16), transparent 60%)" }}
            />
          </div>

          {/* Центр колеса */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full flex items-center justify-center z-10 shadow-[0_0_18px_var(--accent,#6C5CE7)]"
            style={{ background: "radial-gradient(circle at 35% 30%, #a99bff, var(--accent, #6C5CE7) 70%)" }}
          >
            <Disc3 size={20} className="text-black drop-shadow" />
          </div>
        </div>

        <div className="mt-5 min-h-[70px] text-center relative">
          {result && <WheelConfetti key={result.id + (result.orderId ?? "") + Date.now()} />}
          {spinning ? (
            <p className="text-sm text-white/40 animate-pulse">Крутим...</p>
          ) : result ? (
            <div className="animate-in fade-in relative z-10">
              <Sparkles size={22} className="text-accent mx-auto mb-1" />
              {result.type === "nothing" ? (
                <p className="font-medium text-white/60">{result.name}</p>
              ) : (
                <>
                  <p className="font-bold">{result.name}</p>
                  {result.type === "balance" && <p className="text-accent text-xs mt-0.5">Начислено на баланс!</p>}
                  {result.type === "product" && (
                    <>
                      <p className="text-accent text-xs mt-0.5 mb-2">Товар уже в твоих заказах!</p>
                      {result.orderId && (
                        <button
                          onClick={() => router.push(`/chats?order=${result.orderId}`)}
                          className="btn-primary px-4 py-2 text-xs inline-flex items-center gap-1.5"
                        >
                          <MessageCircle size={14} /> Написать продавцу
                        </button>
                      )}
                    </>
                  )}
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
          disabled={spinning || onCooldown}
          className="input-field py-2.5 text-sm flex-1 uppercase disabled:opacity-50"
        />
        <button disabled={spinning || onCooldown || !code.trim()} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50">
          {spinning ? "..." : "Крутить"}
        </button>
      </form>
      {onCooldown && (
        <p className="text-center text-xs text-white/40 -mt-3">
          Следующая попытка через <span className="text-accent font-medium">{formatCooldown(cooldownMsLeft)}</span>
        </p>
      )}

      {prizes.length > 0 && (
        <div>
          <p className="text-xs text-white/40 font-medium mb-2.5">Ты можешь получить</p>
          <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
            {prizes.map((p) => {
              const color = p.type === "product" ? prizeRarity[p.id] ? RARITY_COLOR[prizeRarity[p.id]] : "#3a3f4c" : p.type === "balance" ? "#4caf50" : "#5b6272";
              return (
                <div
                  key={p.id}
                  className="flex-none w-20 rounded-btn bg-white/5 p-2 text-center transition-transform duration-200 hover:-translate-y-1"
                  style={{ borderTop: `2px solid ${color}`, boxShadow: `0 0 0 1px ${color}22` }}
                >
                  <div className="w-full h-12 rounded-md bg-black/30 mb-1.5 flex items-center justify-center overflow-hidden" style={{ boxShadow: `inset 0 0 12px ${color}33` }}>
                    {p.type === "product" && p.image ? (
                      <img src={safeImageSrc(p.image)} alt={p.name} className="w-full h-full object-cover" />
                    ) : p.type === "balance" ? (
                      <span className="text-lg">💰</span>
                    ) : (
                      <span className="text-lg">🚫</span>
                    )}
                  </div>
                  <p className="text-[10px] text-white/60 leading-tight truncate">{p.name}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
