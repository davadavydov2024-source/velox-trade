"use client";

import { useState } from "react";
import { isPremium } from "@/lib/messenger/premium";
import { ProfileCard } from "./ProfileHeader";
import type { MAccount } from "./mtypes";

interface Ach { key: string; icon: string; title: string; hint: string; done: boolean }

/** Достижения профиля: считаются из данных аккаунта, ничего хранить не нужно. */
export function Achievements({ acc }: { acc: MAccount }) {
  const [open, setOpen] = useState<string | null>(null);
  const days = Math.floor((Date.now() - (acc.createdAt || Date.now())) / 86400_000);
  const views = acc.views ?? 0;
  const list: Ach[] = [
    { key: "d7", icon: "🌱", title: "Неделя с нами", hint: "7 дней в мессенджере", done: days >= 7 },
    { key: "d30", icon: "🌿", title: "Месяц с нами", hint: "30 дней в мессенджере", done: days >= 30 },
    { key: "d180", icon: "🌳", title: "Полгода", hint: "180 дней в мессенджере", done: days >= 180 },
    { key: "d365", icon: "🏆", title: "Ветеран", hint: "Год с нами", done: days >= 365 },
    { key: "v10", icon: "👀", title: "Заметный", hint: "Профиль посмотрели 10 раз", done: views >= 10 },
    { key: "v100", icon: "🔥", title: "Популярный", hint: "100 просмотров профиля", done: views >= 100 },
    { key: "v1000", icon: "🌟", title: "Звезда", hint: "1000 просмотров профиля", done: views >= 1000 },
    { key: "bio", icon: "✍️", title: "О себе", hint: "Заполнено «О себе»", done: !!acc.bio?.trim() },
    { key: "photo", icon: "📸", title: "С лицом", hint: "Есть фото профиля", done: !!acc.photoURL },
    { key: "music", icon: "🎧", title: "Меломан", hint: "Мелодия профиля из «Музыки»", done: !!acc.profileTrack },
    { key: "premium", icon: "⭐", title: "Premium", hint: "Активен Mili Premium", done: isPremium(acc) },
    { key: "style", icon: "🎨", title: "Со стилем", hint: "Рамка аватарки или баннер", done: !!acc.frame || !!acc.bannerURL },
    { key: "verified", icon: "✅", title: "Подтверждён", hint: "Подтверждённый аккаунт", done: !!acc.verified },
  ];
  const got = list.filter((a) => a.done).length;
  const sel = list.find((a) => a.key === open);
  return (
    <ProfileCard title={`Достижения · ${got}/${list.length}`}>
      <div className="px-4 pb-2 pt-1 grid grid-cols-5 gap-2">
        {list.map((a) => (
          <button key={a.key} onClick={() => setOpen(open === a.key ? null : a.key)} className="aspect-square rounded-2xl flex items-center justify-center text-[24px] active:scale-95 transition-transform" title={a.title}
            style={{ background: a.done ? "color-mix(in srgb, var(--mx-accent) 16%, transparent)" : "var(--mx-bg)", filter: a.done ? undefined : "grayscale(1)", opacity: a.done ? 1 : 0.4, outline: open === a.key ? "2px solid var(--mx-accent)" : undefined }}>{a.icon}</button>
        ))}
      </div>
      <p className="px-5 pb-2 text-[13px] mx-muted min-h-[20px]">{sel ? <><b style={{ color: "var(--mx-text)" }}>{sel.title}</b> — {sel.hint}{sel.done ? " ✓" : " (ещё не получено)"}</> : "Нажми на значок, чтобы узнать, как его получить"}</p>
    </ProfileCard>
  );
}
