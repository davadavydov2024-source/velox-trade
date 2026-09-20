"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";

/**
 * Анимированный фон. Два режима:
 * - "hero" (по умолчанию) — яркая, заметная версия для страниц входа/регистрации/404 и т.п.,
 *   где фон — часть впечатления, а не подложка под плотный контент.
 * - "ambient" — сильно приглушённая версия для обычных страниц сайта (каталог, админка, профиль
 *   и т.д.), подключена глобально в layout.tsx: пятна почти не видны и не мешают читать списки/
 *   таблицы, но лёгкое фирменное движение на фоне есть везде. Без частиц и без затемняющего слоя
 *   поверх (тут не нужно "приглушать яркость" — она и так низкая).
 */
export function AuthBackground({ variant = "hero" }: { variant?: "hero" | "ambient" }) {
  const pathname = usePathname();
  const particles = useMemo(
    () =>
      Array.from({ length: 22 }).map((_, i) => ({
        id: i,
        left: Math.round(Math.random() * 100),
        size: 3 + Math.round(Math.random() * 5),
        duration: 7 + Math.round(Math.random() * 9),
        delay: Math.round(Math.random() * 8),
      })),
    []
  );

  // В админке фон не нужен — там плотные таблицы и формы, декоративное движение только мешает
  // работе. Ограничение только для "ambient" (глобальный фон в layout.tsx) — для "hero" (страницы
  // входа/регистрации/404) это не актуально, admin туда не попадает.
  if (variant === "ambient" && pathname?.startsWith("/admin")) return null;

  if (variant === "ambient") {
    return (
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-bg">
        <div
          className="auth-blob-1 absolute -top-40 -left-40 w-[560px] h-[560px] rounded-full opacity-[0.05] blur-3xl"
          style={{ background: "radial-gradient(circle, var(--color-accent) 0%, transparent 65%)" }}
        />
        <div
          className="auth-blob-2 absolute -bottom-52 -right-32 w-[620px] h-[620px] rounded-full opacity-[0.045] blur-3xl"
          style={{ background: "radial-gradient(circle, #4a6cf7 0%, transparent 65%)" }}
        />
        <div
          className="auth-blob-3 absolute top-1/2 left-1/2 w-[440px] h-[440px] rounded-full opacity-[0.035] blur-3xl"
          style={{ background: "radial-gradient(circle, #22c55e 0%, transparent 65%)" }}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-bg">
      {/* Медленно вращающийся цветной "мешь" на весь экран — база, поверх которой двигаются пятна */}
      <div
        className="absolute -inset-[20%] auth-mesh-spin opacity-40"
        style={{
          background:
            "conic-gradient(from 0deg, var(--color-accent), #4a6cf7, #22c55e, #e879f9, var(--color-accent))",
          filter: "blur(120px)",
        }}
      />

      <div
        className="auth-blob-1 absolute -top-40 -left-40 w-[560px] h-[560px] rounded-full opacity-60 blur-2xl"
        style={{ background: "radial-gradient(circle, var(--color-accent) 0%, transparent 65%)" }}
      />
      <div
        className="auth-blob-2 absolute -bottom-52 -right-32 w-[620px] h-[620px] rounded-full opacity-55 blur-2xl"
        style={{ background: "radial-gradient(circle, #4a6cf7 0%, transparent 65%)" }}
      />
      <div
        className="auth-blob-3 absolute top-1/2 left-1/2 w-[440px] h-[440px] rounded-full opacity-45 blur-2xl"
        style={{ background: "radial-gradient(circle, #22c55e 0%, transparent 65%)" }}
      />
      <div
        className="auth-blob-4 absolute top-10 right-10 w-[380px] h-[380px] rounded-full opacity-40 blur-2xl"
        style={{ background: "radial-gradient(circle, #e879f9 0%, transparent 65%)" }}
      />

      {/* Затемнение поверх пятен, чтобы текст и карточка оставались читаемыми несмотря на яркость */}
      <div className="absolute inset-0 bg-bg/55" />

      {particles.map((p) => (
        <span
          key={p.id}
          className="auth-float-particle absolute bottom-0 rounded-full bg-accent shadow-[0_0_8px_2px_var(--color-accent)]"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}

      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "28px 28px" }}
      />
    </div>
  );
}
