"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Disc3, SkipForward, Volume2, VolumeX, Zap } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { getAllWheelPrizes } from "@/lib/wheelPrizes";
import { getProductById } from "@/lib/products";
import { RARITY_COLOR } from "@/lib/rarityColors";
import { RARITY_LABEL, Rarity, WheelPrize } from "@/types";
import { safeImageSrc } from "@/lib/safeImage";
import { AuthBackground } from "@/components/AuthBackground";
import { WheelResultModal, WheelPrizeResult } from "@/components/WheelResultModal";
import { cubicBezier, easeInOutSine, easeOutSine, getAudioContext, playLose, playTick, playWin, prefersReducedMotion, vibrate } from "@/lib/wheelFx";

type Phase = "idle" | "requesting" | "spinning" | "landed";

const NON_PRODUCT_COLOR: Record<"balance" | "nothing", string> = { balance: "#4ade80", nothing: "#5b6272" };
const BULB_COUNT = 24;
// Держим в синхроне с COOLDOWN_MS на сервере (src/app/api/wheel/spin/route.ts) — используется
// только для отображения таймера на клиенте, реальная проверка всегда идёт на сервере.
const WHEEL_COOLDOWN_MS = 7 * 60 * 60 * 1000;

// Тайминги и физика прокрутки.
const T_PULL = 420; // «замах» назад перед стартом
const T_MAIN = 5400; // основной бег с плавным торможением
const T_SETTLE = 600; // откат после перелёта — колесо «приседает» на свой сектор
const PULL_DEG = 14;
const OVERSHOOT_DEG = 5;
const SPINS = 6;
const LAND_PAUSE_MS = 950; // пауза на подсветку сектора перед экраном результата
const mainEase = cubicBezier(0.22, 0.08, 0.12, 1);

const SOUND_KEY = "wheel_sound";
const SKIP_KEY = "wheel_skip_anim";

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
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<WheelPrizeResult | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [winIndex, setWinIndex] = useState(-1);
  const [prizeRarity, setPrizeRarity] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const [soundOn, setSoundOn] = useState(false);
  const [alwaysSkip, setAlwaysSkip] = useState(false);

  // Колесо вращается напрямую через DOM (rAF) — без setState на каждый кадр, иначе 60 перерисовок в секунду.
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<HTMLDivElement | null>(null);
  const rotationRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const landTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);
  const soundOnRef = useRef(false);

  const spinBusy = phase !== "idle";

  useEffect(() => {
    try {
      const s = localStorage.getItem(SOUND_KEY) === "1";
      setSoundOn(s);
      soundOnRef.current = s;
      setAlwaysSkip(localStorage.getItem(SKIP_KEY) === "1");
    } catch {
      // localStorage недоступен — работаем с настройками по умолчанию
    }
  }, []);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    soundOnRef.current = next;
    try {
      localStorage.setItem(SOUND_KEY, next ? "1" : "0");
    } catch {}
    if (next) {
      // Включили по клику — это жест пользователя, можно создать AudioContext и сыграть пробный щелчок.
      audioRef.current = audioRef.current ?? getAudioContext();
      audioRef.current?.resume?.();
      if (audioRef.current) playTick(audioRef.current, 0.4);
    }
  }

  function toggleAlwaysSkip() {
    const next = !alwaysSkip;
    setAlwaysSkip(next);
    try {
      localStorage.setItem(SKIP_KEY, next ? "1" : "0");
    } catch {}
  }

  // Тикает раз в секунду, только пока реально идёт отсчёт кулдауна — используется для видимого
  // таймера "следующая попытка через".
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
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (landTimer.current) clearTimeout(landTimer.current);
      audioRef.current?.close?.();
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

  const prizeColor = (p: WheelPrize) =>
    p.type === "product" ? RARITY_COLOR[prizeRarity[p.id] ?? "common"] ?? RARITY_COLOR.common : NON_PRODUCT_COLOR[p.type];

  // Координаты и поворот картинки приза в каждом секторе — считаем один раз на список призов.
  const segmentPositions = useMemo(() => {
    const radius = 33; // % от центра колеса
    return prizes.map((_, i) => {
      const center = i * segmentAngle + segmentAngle / 2;
      const rad = (center * Math.PI) / 180;
      return { left: 50 + radius * Math.sin(rad), top: 50 - radius * Math.cos(rad), center };
    });
  }, [prizes, segmentAngle]);

  // Штырьки на границах секторов — об них «щёлкает» указатель.
  const pegPositions = useMemo(
    () =>
      prizes.map((_, i) => {
        const rad = ((i * segmentAngle) * Math.PI) / 180;
        return { left: 50 + 47 * Math.sin(rad), top: 50 - 47 * Math.cos(rad) };
      }),
    [prizes, segmentAngle]
  );

  const wheelBackground = useMemo(() => {
    if (prizes.length === 0) return "#14141c";

    function mixWithDark(hex: string, amount: number): string {
      const dark = { r: 20, g: 20, b: 28 };
      const c = hex.replace("#", "");
      const r = parseInt(c.substring(0, 2), 16);
      const g = parseInt(c.substring(2, 4), 16);
      const b = parseInt(c.substring(4, 6), 16);
      return `rgb(${Math.round(r * amount + dark.r * (1 - amount))}, ${Math.round(g * amount + dark.g * (1 - amount))}, ${Math.round(b * amount + dark.b * (1 - amount))})`;
    }

    const lineWidth = Math.min(1.6, segmentAngle * 0.12);
    const stops: string[] = [];
    prizes.forEach((p, i) => {
      const from = i * segmentAngle;
      const to = (i + 1) * segmentAngle;
      stops.push(`${mixWithDark(prizeColor(p), i % 2 === 0 ? 0.55 : 0.38)} ${from + lineWidth / 2}deg ${to - lineWidth / 2}deg`);
      stops.push(`rgba(255,255,255,0.4) ${to - lineWidth / 2}deg ${to + lineWidth / 2}deg`);
    });
    return `conic-gradient(${stops.join(", ")})`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prizes, segmentAngle, prizeRarity]);

  // ───────────── Анимация ─────────────

  const applyRotation = (deg: number) => {
    rotationRef.current = deg;
    if (wheelRef.current) wheelRef.current.style.transform = `rotate(${deg}deg)`;
  };

  /** Какой сектор сейчас под указателем (он сверху, на 0°). */
  const indexAt = (deg: number) => {
    if (prizes.length === 0 || segmentAngle <= 0) return 0;
    const local = (((-deg) % 360) + 360) % 360;
    return Math.min(prizes.length - 1, Math.floor(local / segmentAngle));
  };

  /** Указатель дёргается каждый раз, когда проезжает штырёк; на скорости — резче и короче. */
  const pointerTick = (speed: number) => {
    const el = pointerRef.current;
    if (!el || typeof el.animate !== "function") return;
    el.animate(
      [
        { transform: "translateX(-50%) rotate(0deg)" },
        { transform: `translateX(-50%) rotate(${-(14 + speed * 12)}deg)` },
        { transform: "translateX(-50%) rotate(0deg)" },
      ],
      { duration: 150 - speed * 70, easing: "ease-out" }
    );
  };

  function runSpin(from: number, to: number, onDone: (instant: boolean) => void) {
    const start = performance.now();
    const base = from - PULL_DEG;
    const mainTarget = to + OVERSHOOT_DEG;
    let prevAngle = from;
    let prevT = start;
    let lastIdx = indexAt(from);
    let lastTickSound = 0;

    const finish = (instant: boolean) => {
      applyRotation(to);
      stageRef.current?.style.setProperty("--spin", "0");
      rafRef.current = null;
      onDone(instant);
    };

    const frame = (nowT: number) => {
      // «Пропустить»: сразу прыгаем в конечное положение.
      if (skipRef.current) {
        finish(true);
        return;
      }
      const t = nowT - start;
      let angle: number;
      if (t < T_PULL) {
        angle = from - PULL_DEG * easeOutSine(t / T_PULL);
      } else if (t < T_PULL + T_MAIN) {
        angle = base + (mainTarget - base) * mainEase((t - T_PULL) / T_MAIN);
      } else if (t < T_PULL + T_MAIN + T_SETTLE) {
        angle = mainTarget - OVERSHOOT_DEG * easeInOutSine((t - T_PULL - T_MAIN) / T_SETTLE);
      } else {
        finish(false);
        return;
      }

      applyRotation(angle);
      const dt = Math.max(1, nowT - prevT);
      const speed = Math.min(1, Math.abs(angle - prevAngle) / dt / 1.4);
      prevAngle = angle;
      prevT = nowT;
      stageRef.current?.style.setProperty("--spin", speed.toFixed(3));

      const idx = indexAt(angle);
      if (idx !== lastIdx) {
        lastIdx = idx;
        pointerTick(speed);
        if (soundOnRef.current) {
          if (audioRef.current && nowT - lastTickSound > 38) {
            playTick(audioRef.current, speed);
            lastTickSound = nowT;
          }
          if (speed < 0.45) vibrate(6);
        }
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  }

  function skipAnimation() {
    skipRef.current = true;
  }

  // Escape / Пробел во время прокрутки тоже пропускают анимацию.
  useEffect(() => {
    if (phase !== "spinning") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        skipRef.current = true;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  function revealResult(prize: WheelPrizeResult, idx: number, instant: boolean) {
    setWinIndex(idx);
    setResult(prize);
    setCode("");
    setPhase("landed");
    refreshProfile();

    const lost = prize.type === "nothing";
    const rar = prize.type === "product" ? prizeRarity[prize.id] : undefined;
    const open = () => {
      setShowModal(true);
      if (soundOnRef.current) {
        if (audioRef.current) {
          if (lost) playLose(audioRef.current);
          else playWin(audioRef.current, rar === "legendary" || rar === "epic");
        }
        vibrate(lost ? [50] : [30, 40, 30, 40, 100]);
      }
    };
    if (instant) open();
    else landTimer.current = setTimeout(open, LAND_PAUSE_MS); // даём секунду полюбоваться подсвеченным сектором
  }

  function closeResult() {
    setShowModal(false);
    setResult(null);
    setWinIndex(-1);
    setPhase("idle");
    loadPrizes(); // список призов обновляем только сейчас — иначе колесо перестроилось бы под окном результата
  }

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
    setShowModal(false);
    setWinIndex(-1);
    skipRef.current = false;
    setPhase("requesting");

    // Звук включаем по клику «Крутить» — это жест пользователя, иначе браузер заблокирует AudioContext.
    if (soundOnRef.current) {
      audioRef.current = audioRef.current ?? getAudioContext();
      audioRef.current?.resume?.();
    }

    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/wheel/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось прокрутить колесо");

      // Приз определён на сервере и уже выдан — дальше только красивая анимация, которую можно пропустить.
      const prize: WheelPrizeResult = { ...data.prize, orderId: data.orderId };
      let targetIndex = prizes.findIndex((p) => p.id === prize.id);
      if (targetIndex === -1) targetIndex = 0; // приз уже не в текущем списке (редкий случай) — крутим наугад

      // Колесо не всегда встаёт ровно по центру сектора — небольшой разброс выглядит живее и «честнее».
      const jitter = (Math.random() - 0.5) * segmentAngle * 0.55;
      const centerAngle = targetIndex * segmentAngle + segmentAngle / 2 + jitter;
      const targetMod = (360 - centerAngle + 360) % 360;
      const from = rotationRef.current;
      const extra = (targetMod - (from % 360) + 360) % 360;
      const to = from + SPINS * 360 + extra;

      if (alwaysSkip || prefersReducedMotion()) {
        applyRotation(to);
        revealResult(prize, targetIndex, true);
        return;
      }

      setPhase("spinning");
      runSpin(from, to, (instant) => revealResult(prize, targetIndex, instant));
    } catch (err: any) {
      setPhase("idle");
      toast("error", err.message || "Не удалось прокрутить колесо");
    }
  }

  const lost = result?.type === "nothing";
  const landed = phase === "landed";
  const accent = "var(--accent, #6C5CE7)";

  return (
    <div className="max-w-md mx-auto space-y-6 relative">
      <AuthBackground />
      <div className="text-center">
        <h1 className="text-2xl font-black flex items-center justify-center gap-2 tracking-tight">
          <Disc3 size={24} className="text-accent" /> Колесо Фортуны
        </h1>
        <p className="text-sm text-white/40 mt-1">Введи промокод колеса — его можно активировать раз в 7 часов и получить случайный приз.</p>
      </div>

      <div className="flex flex-col items-center">
        <div
          ref={stageRef}
          className={`relative ${landed && lost ? "wheel-shake" : ""}`}
          style={{ width: "min(92vw, 380px)", aspectRatio: "1 / 1" }}
        >
          {/* Свечение: ровное «дыхание» + живое, которое разгорается со скоростью вращения */}
          <div
            className="wheel-ambient-glow absolute rounded-full pointer-events-none"
            style={{ inset: "-6%", background: `radial-gradient(circle, ${accent}55 0%, transparent 70%)`, filter: "blur(18px)" }}
          />
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              inset: "-12%",
              background: `radial-gradient(circle, ${accent}88 0%, transparent 68%)`,
              filter: "blur(26px)",
              opacity: "calc(var(--spin, 0) * 0.9)",
              transform: "scale(calc(1 + var(--spin, 0) * 0.1))",
            }}
          />

          {/* Металлический обод */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "conic-gradient(from 0deg, #3b3358, #7a6bd6 12%, #2a2444 25%, #6a5cc0 40%, #2a2444 55%, #7a6bd6 70%, #2a2444 85%, #3b3358)",
              boxShadow: "0 0 0 2px rgba(255,255,255,0.08), 0 18px 50px -12px rgba(0,0,0,0.75), inset 0 0 22px rgba(0,0,0,0.6)",
            }}
          />
          <div className="absolute rounded-full bg-[#0d0d14]" style={{ inset: "5.4%" }} />

          {/* Лампочки по ободу */}
          {Array.from({ length: BULB_COUNT }).map((_, i) => {
            const rad = ((i / BULB_COUNT) * 360 * Math.PI) / 180;
            const bulbColor = i % 2 === 0 ? "#ffd76b" : "#ff8fb1";
            return (
              <span
                key={i}
                className={`wheel-bulb absolute rounded-full ${phase === "spinning" ? "spinning" : ""}`}
                style={{
                  left: `${50 + 46.4 * Math.sin(rad)}%`,
                  top: `${50 - 46.4 * Math.cos(rad)}%`,
                  width: "2.4%",
                  height: "2.4%",
                  transform: "translate(-50%, -50%)",
                  background: bulbColor,
                  color: bulbColor,
                  animationDelay: `${(i % 6) * 0.12}s`,
                }}
              />
            );
          })}

          {/* Само колесо — вращается через ref, без перерисовок React */}
          <div
            ref={wheelRef}
            className={`absolute rounded-full overflow-hidden ${landed && lost ? "wheel-lose" : ""}`}
            style={{
              inset: "8.6%",
              background: wheelBackground,
              border: "3px solid rgba(255,255,255,0.12)",
              boxShadow: `inset 0 0 30px rgba(0,0,0,0.55), 0 0 40px -10px ${accent}`,
              willChange: "transform",
            }}
          >
            {loadingPrizes ? (
              <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm">Загрузка...</div>
            ) : prizes.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm text-center px-6">Колесо ещё не настроено</div>
            ) : (
              <>
                {/* Подсветка выигрышного сектора */}
                {winIndex >= 0 && !lost && (
                  <div
                    className="wheel-win-pulse absolute inset-0 pointer-events-none"
                    style={{
                      background: `conic-gradient(from ${winIndex * segmentAngle}deg, rgba(255,255,255,0.42) 0deg ${segmentAngle}deg, transparent ${segmentAngle}deg)`,
                    }}
                  />
                )}

                {/* Штырьки по краю */}
                {pegPositions.map((pos, i) => (
                  <span
                    key={`peg-${i}`}
                    className="absolute rounded-full"
                    style={{
                      left: `${pos.left}%`,
                      top: `${pos.top}%`,
                      width: "3%",
                      height: "3%",
                      transform: "translate(-50%, -50%)",
                      background: "radial-gradient(circle at 35% 30%, #fff, #c9c4e8 60%, #8b84b8)",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.6)",
                    }}
                  />
                ))}

                {prizes.map((p, i) => {
                  const color = prizeColor(p);
                  return (
                    <div
                      key={p.id}
                      className="absolute rounded-full overflow-hidden bg-black/55 flex items-center justify-center shadow-lg"
                      style={{
                        left: `${segmentPositions[i].left}%`,
                        top: `${segmentPositions[i].top}%`,
                        width: "17%",
                        aspectRatio: "1 / 1",
                        // Картинка повёрнута «макушкой» к ободу — читается как на настоящем колесе.
                        transform: `translate(-50%, -50%) rotate(${segmentPositions[i].center}deg)`,
                        border: `2px solid ${color}`,
                        boxShadow: `0 0 12px ${color}66`,
                      }}
                    >
                      {p.type === "product" && p.image ? (
                        <img src={safeImageSrc(p.image)} alt={p.name} className="w-full h-full object-cover" />
                      ) : p.type === "balance" ? (
                        <span className="text-base">💰</span>
                      ) : (
                        <span className="text-base">🚫</span>
                      )}
                    </div>
                  );
                })}
              </>
            )}
            {/* Стеклянный блик — глубина и объём */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: "radial-gradient(ellipse 70% 45% at 30% 20%, rgba(255,255,255,0.16), transparent 60%)" }}
            />
          </div>

          {/* Указатель — дёргается при каждом штырьке (см. pointerTick) */}
          <div
            ref={pointerRef}
            className="absolute z-20"
            style={{ top: "-3.2%", left: "50%", transform: "translateX(-50%)", transformOrigin: "50% 18%" }}
          >
            <div
              style={{
                width: 0,
                height: 0,
                borderLeft: "15px solid transparent",
                borderRight: "15px solid transparent",
                borderTop: `26px solid ${accent}`,
                filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.6))",
              }}
            />
            <div className="w-4 h-4 rounded-full bg-white mx-auto -mt-[22px] shadow-[0_0_10px_rgba(255,255,255,0.8)] relative" />
          </div>

          {/* Центр колеса */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center z-10"
            style={{
              width: "17%",
              aspectRatio: "1 / 1",
              background: `radial-gradient(circle at 35% 30%, #c9c0ff, ${accent} 70%)`,
              boxShadow: `0 0 0 4px rgba(13,13,20,0.9), 0 0 24px ${accent}`,
            }}
          >
            <Disc3 size={22} className="text-black drop-shadow" />
          </div>
        </div>

        {/* Статус / кнопка «Пропустить» */}
        <div className="mt-5 min-h-[52px] flex items-center justify-center">
          {phase === "requesting" ? (
            <p className="text-sm text-white/50 animate-pulse flex items-center gap-2">
              <Zap size={14} className="text-accent" /> Запускаем колесо…
            </p>
          ) : phase === "spinning" ? (
            <button
              type="button"
              onClick={skipAnimation}
              className="wheel-skip-in inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold bg-white/10 hover:bg-white/20 active:scale-95 border border-white/15 backdrop-blur transition-all"
            >
              <SkipForward size={16} /> Пропустить
            </button>
          ) : landed ? (
            <p className="text-sm text-white/50 animate-pulse">{lost ? "Не повезло…" : "Есть приз!"}</p>
          ) : (
            <p className="text-xs text-white/30">Крутится до 6 секунд · анимацию можно пропустить</p>
          )}
        </div>
      </div>

      <form onSubmit={handleSpin} className="flex gap-2">
        <input
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Промокод колеса"
          disabled={spinBusy || onCooldown}
          className="input-field py-2.5 text-sm flex-1 uppercase disabled:opacity-50"
        />
        <button disabled={spinBusy || onCooldown || !code.trim()} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50">
          {spinBusy ? "..." : "Крутить"}
        </button>
      </form>
      {onCooldown && (
        <p className="text-center text-xs text-white/40 -mt-3">
          Следующая попытка через <span className="text-accent font-medium">{formatCooldown(cooldownMsLeft)}</span>
        </p>
      )}

      {/* Настройки анимации */}
      <div className="flex items-center justify-center gap-5 text-xs text-white/50 -mt-2">
        <button type="button" onClick={toggleSound} className="inline-flex items-center gap-1.5 hover:text-white transition-colors" aria-pressed={soundOn}>
          {soundOn ? <Volume2 size={14} className="text-accent" /> : <VolumeX size={14} />}
          Звук и вибрация {soundOn ? "вкл" : "выкл"}
        </button>
        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none hover:text-white transition-colors">
          <input type="checkbox" checked={alwaysSkip} onChange={toggleAlwaysSkip} className="accent-[var(--accent,#6C5CE7)]" />
          Всегда пропускать анимацию
        </label>
      </div>

      {prizes.length > 0 && (
        <div>
          <p className="text-xs text-white/40 font-medium mb-2.5">Ты можешь получить</p>
          <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
            {prizes.map((p) => {
              const color = prizeColor(p);
              const rar = prizeRarity[p.id] as Rarity | undefined;
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
                  {p.type === "product" && rar && (
                    <p className="text-[9px] mt-0.5 font-semibold" style={{ color }}>
                      {RARITY_LABEL[rar]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showModal && result && (
        <WheelResultModal
          result={result}
          rarity={result.type === "product" ? prizeRarity[result.id] : undefined}
          cooldownText={formatCooldown(WHEEL_COOLDOWN_MS)}
          onClose={closeResult}
          onChat={result.orderId ? () => router.push(`/chats?order=${result.orderId}`) : undefined}
        />
      )}
    </div>
  );
}
