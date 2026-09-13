"use client";

import { useMemo } from "react";

/**
 * Анимированный фон для страниц входа/регистрации — плавно двигающиеся размытые цветные пятна
 * (blobs) плюс редкие всплывающие частицы. Чисто декоративный слой, fixed и pointer-events-none,
 * не мешает взаимодействию с формой поверх него.
 */
export function AuthBackground() {
  // Частицы генерируются один раз за монтирование компонента (не при каждом ререндере формы),
  // чтобы они не дёргались/не пересоздавались при вводе текста в поля выше.
  const particles = useMemo(
    () =>
      Array.from({ length: 14 }).map((_, i) => ({
        id: i,
        left: Math.round(Math.random() * 100),
        size: 2 + Math.round(Math.random() * 3),
        duration: 10 + Math.round(Math.random() * 10),
        delay: Math.round(Math.random() * 10),
      })),
    []
  );

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-bg">
      <div
        className="auth-blob-1 absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full opacity-25 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--color-accent) 0%, transparent 70%)" }}
      />
      <div
        className="auth-blob-2 absolute -bottom-40 -right-20 w-[480px] h-[480px] rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, #4a6cf7 0%, transparent 70%)" }}
      />
      <div
        className="auth-blob-3 absolute top-1/2 left-1/2 w-[300px] h-[300px] rounded-full opacity-10 blur-3xl"
        style={{ background: "radial-gradient(circle, #22c55e 0%, transparent 70%)" }}
      />

      {particles.map((p) => (
        <span
          key={p.id}
          className="auth-float-particle absolute bottom-0 rounded-full bg-accent"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}

      {/* Едва заметная точечная сетка поверх пятен — добавляет текстуры, не отвлекая от формы */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "32px 32px" }}
      />
    </div>
  );
}
