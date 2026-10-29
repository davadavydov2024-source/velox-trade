"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Lightbulb, X } from "lucide-react";
import { useAuth } from "@/lib/authContext";

/**
 * Обучение для новичков: подсвечивает нужное место на странице и показывает стрелку с подсказкой —
 * где указать ник и юзернейм, где пополнить баланс, где каталог и безопасность. Запускается само
 * для аккаунтов младше 14 дней, пока человек не пройдёт обучение или не пропустит его. Если нужного
 * элемента нет на экране (например, на телефоне), шаг показывается по центру без стрелки.
 * Повторно: кнопка «Обучение» на странице /profile.
 */

const STORAGE_PREFIX = "velox_tour_v1_";
const NEWBIE_DAYS = 14;
const START_EVENT = "velox:start-tour";

interface Step {
  route?: string;
  title: string;
  text: string;
  find?: () => HTMLElement | null;
}

const isVisible = (el: Element | null): el is HTMLElement => {
  if (!el) return false;
  const r = (el as HTMLElement).getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
};
const firstVisible = (selector: string): HTMLElement | null => Array.from(document.querySelectorAll<HTMLElement>(selector)).find(isVisible) ?? null;
const byLabel = (start: string): HTMLElement | null => {
  const label = Array.from(document.querySelectorAll("label")).find((l) => l.textContent?.trim().startsWith(start));
  return (label?.parentElement as HTMLElement | null) ?? null;
};

const STEPS: Step[] = [
  {
    title: "Добро пожаловать в Velox Trade! 👋",
    text: "Покажем за минуту, где что находится: где указать ник, как пополнить баланс и где искать предметы. Можно пропустить в любой момент.",
  },
  {
    route: "/profile",
    find: () => byLabel("Ник"),
    title: "1. Укажи свой ник",
    text: "Вот здесь вписывается ник — это имя, которое видят другие игроки в чатах и на твоих товарах. Впиши его и нажми «Сохранить» внизу. Менять ник можно раз в 7 дней.",
  },
  {
    route: "/profile",
    find: () => byLabel("Юзернейм"),
    title: "2. Придумай юзернейм",
    text: "Юзернейм — уникальное имя для ссылки на твой профиль продавца. Только латиница, цифры и «_», от 3 до 20 символов. Он обязателен.",
  },
  {
    route: "/profile",
    find: () => firstVisible('a[href="/profile/topup"]'),
    title: "3. Баланс и пополнение",
    text: "Здесь виден баланс в рублях. Нажми, чтобы пополнить его и покупать предметы. Звёзды ⭐ пополняются на отдельной странице «Пополнение ⭐».",
  },
  {
    route: "/profile",
    find: () => firstVisible('a[href="/catalog"]'),
    title: "4. Каталог",
    text: "Тут все товары: выбери игру, найди нужный предмет и оформи покупку. Продавец передаст его, а деньги спишутся только после подтверждения.",
  },
  {
    route: "/profile",
    find: () => firstVisible('a[href="/profile/security"]'),
    title: "5. Безопасность",
    text: "Здесь включаются двухфакторная защита, уведомления, привязывается Telegram и видны твои устройства. Советуем заглянуть сюда сразу.",
  },
  {
    title: "Готово! 🎉",
    text: "Теперь ты знаешь основное. Если что-то непонятно — раздел «Поддержка». Обучение можно запустить снова кнопкой «Обучение» на странице профиля.",
  },
];

const PAD = 8; // отступ подсветки вокруг элемента
const ARROW_GAP = 46; // место под стрелку между элементом и подсказкой

export function OnboardingTour() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const autoStarted = useRef(false);

  const step = STEPS[index];
  const storageKey = user ? `${STORAGE_PREFIX}${user.uid}` : null;

  const finish = useCallback(() => {
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, "done");
      } catch {}
    }
    setActive(false);
    setRect(null);
  }, [storageKey]);

  const start = useCallback(() => {
    setIndex(0);
    setActive(true);
  }, []);

  // Ручной запуск (кнопка «Обучение»)
  useEffect(() => {
    const handler = () => start();
    window.addEventListener(START_EVENT, handler);
    return () => window.removeEventListener(START_EVENT, handler);
  }, [start]);

  // Автозапуск для новых аккаунтов
  useEffect(() => {
    if (autoStarted.current || !user || !profile || !storageKey) return;
    if (pathname.startsWith("/auth") || pathname.startsWith("/admin") || pathname.startsWith("/staff")) return;
    if (!profile.username) return; // сначала окно «Придумай юзернейм»
    const ageMs = Date.now() - (profile.createdAt ?? 0);
    if (ageMs > NEWBIE_DAYS * 24 * 60 * 60 * 1000) return;
    try {
      if (localStorage.getItem(storageKey)) return;
    } catch {}
    autoStarted.current = true;
    const t = setTimeout(start, 1500);
    return () => clearTimeout(t);
  }, [user, profile, storageKey, pathname, start]);

  // Переход на страницу шага и поиск элемента (ждём, пока страница отрисуется)
  useEffect(() => {
    if (!active) return;
    if (step.route && pathname !== step.route) {
      router.push(step.route);
      return;
    }
    if (!step.find) {
      setRect(null);
      return;
    }
    let tries = 0;
    let cancelled = false;
    const locate = () => {
      if (cancelled) return;
      const el = step.find!();
      if (el && isVisible(el)) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        // даём прокрутке закончиться, затем считаем положение
        setTimeout(() => !cancelled && setRect(el.getBoundingClientRect()), 350);
        return;
      }
      if (++tries < 25) setTimeout(locate, 160);
      else setRect(null); // не нашли — покажем шаг по центру
    };
    setRect(null);
    locate();
    return () => {
      cancelled = true;
    };
  }, [active, index, pathname, step, router]);

  // Пересчёт при изменении размера окна и прокрутке
  useLayoutEffect(() => {
    if (!active) return;
    const update = () => {
      setVp({ w: window.innerWidth, h: window.innerHeight });
      if (step.find) {
        const el = step.find();
        if (el && isVisible(el)) setRect(el.getBoundingClientRect());
      }
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, step]);

  // Esc — пропустить
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && finish();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish]);

  // Кнопка «Обучение» на /profile
  const showHelpButton = !active && !!user && pathname === "/profile";

  if (!active) {
    return showHelpButton ? (
      <button
        type="button"
        onClick={start}
        className="fixed left-3 bottom-20 sm:bottom-5 z-[60] flex items-center gap-1.5 px-3 py-2 rounded-full bg-surface/95 border border-white/15 text-xs text-white/70 hover:text-white hover:border-accent/60 shadow-lg backdrop-blur transition-colors"
      >
        <Lightbulb size={14} className="text-accent" /> Обучение
      </button>
    ) : null;
  }

  const isLast = index === STEPS.length - 1;
  const width = Math.min(340, (vp.w || 360) - 24);
  const centered = !rect;

  // Положение подсказки: над элементом, если он в нижней половине экрана, иначе под ним.
  let tipStyle: React.CSSProperties = { width };
  let arrowDir: "up" | "down" = "up";
  let arrowLeft = width / 2;
  let spot: React.CSSProperties | null = null;
  let arrowIconStyle: React.CSSProperties = {};

  if (rect) {
    const above = rect.top + rect.height / 2 > (vp.h || 600) / 2;
    const center = rect.left + rect.width / 2;
    const left = Math.max(12, Math.min(center - width / 2, (vp.w || 360) - width - 12));
    arrowLeft = Math.max(20, Math.min(center - left, width - 20));
    spot = { left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };
    if (above) {
      tipStyle = { width, left, bottom: (vp.h || 600) - rect.top + PAD + ARROW_GAP };
      arrowDir = "down";
      arrowIconStyle = { left: center - 14, top: rect.top - PAD - 38 };
    } else {
      tipStyle = { width, left, top: rect.bottom + PAD + ARROW_GAP };
      arrowDir = "up";
      arrowIconStyle = { left: center - 14, top: rect.bottom + PAD + 8 };
    }
  }

  return (
    <div className="fixed inset-0 z-[300]" role="dialog" aria-label="Обучение">
      <style>{`@keyframes veloxTourBounceDown{0%,100%{transform:translateY(0)}50%{transform:translateY(8px)}}@keyframes veloxTourBounceUp{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}@keyframes veloxTourPulse{0%,100%{box-shadow:0 0 0 9999px rgba(5,7,12,.72),0 0 0 3px var(--color-accent,#ff9800)}50%{box-shadow:0 0 0 9999px rgba(5,7,12,.72),0 0 0 7px rgba(255,152,0,.45)}}`}</style>

      {/* затемнение; вырез вокруг элемента */}
      {spot ? (
        <div className="absolute rounded-xl pointer-events-none" style={{ ...spot, animation: "veloxTourPulse 1.6s ease-in-out infinite", transition: "all .25s ease" }} />
      ) : (
        <div className="absolute inset-0 bg-[rgba(5,7,12,.72)]" />
      )}
      {/* перехватываем клики вне подсказки */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {/* стрелка */}
      {rect &&
        (arrowDir === "down" ? (
          <ArrowDown size={28} strokeWidth={3} className="absolute text-accent drop-shadow-[0_0_8px_rgba(255,152,0,.8)]" style={{ ...arrowIconStyle, animation: "veloxTourBounceDown 1s ease-in-out infinite" }} />
        ) : (
          <ArrowUp size={28} strokeWidth={3} className="absolute text-accent drop-shadow-[0_0_8px_rgba(255,152,0,.8)]" style={{ ...arrowIconStyle, animation: "veloxTourBounceUp 1s ease-in-out infinite" }} />
        ))}

      {/* подсказка */}
      <div
        className={`absolute rounded-2xl bg-surface border border-white/15 shadow-2xl p-5 ${centered ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" : ""}`}
        style={centered ? { width } : tipStyle}
      >
        {rect && (
          <span
            className="absolute w-4 h-4 bg-surface border-white/15 rotate-45"
            style={{ left: arrowLeft - 8, ...(arrowDir === "down" ? { bottom: -8, borderRight: "1px solid", borderBottom: "1px solid" } : { top: -8, borderLeft: "1px solid", borderTop: "1px solid" }) }}
          />
        )}
        <button type="button" onClick={finish} className="absolute top-3 right-3 p-1 rounded-md text-white/40 hover:text-white hover:bg-white/10" aria-label="Пропустить обучение">
          <X size={16} />
        </button>
        <p className="text-[11px] text-accent font-semibold mb-1">
          Шаг {index + 1} из {STEPS.length}
        </p>
        <h2 className="font-bold text-base pr-6 leading-snug">{step.title}</h2>
        <p className="text-sm text-white/60 mt-2 leading-relaxed">{step.text}</p>

        <div className="flex items-center justify-between gap-2 mt-4">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-accent" : "w-1.5 bg-white/20"}`} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {index > 0 && !isLast && (
              <button type="button" onClick={() => setIndex((i) => Math.max(0, i - 1))} className="text-xs text-white/50 hover:text-white px-2 py-1.5">
                Назад
              </button>
            )}
            {!isLast && index === 0 && (
              <button type="button" onClick={finish} className="text-xs text-white/50 hover:text-white px-2 py-1.5">
                Пропустить
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? finish() : setIndex((i) => i + 1))}
              className="btn-primary px-4 py-2 text-sm"
            >
              {isLast ? "Понятно" : index === 0 ? "Начать" : "Далее"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
