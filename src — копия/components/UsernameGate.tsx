"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AtSign } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { getUserProfile } from "@/lib/users";
import { saveMyUsername, usernameFormatError } from "@/lib/usernames";
import { useToast } from "@/lib/toastContext";
import { OnboardingTour } from "@/components/OnboardingTour";

/**
 * Юзернейм обязателен для всех аккаунтов. Если вошедший пользователь его ещё не задал (старые
 * аккаунты, вход через Telegram/Google/VK, или имя заняли в момент регистрации) — закрываем сайт
 * окном «Придумай юзернейм», пока он не выберет свободное имя. Выйти из аккаунта можно.
 */
export function UsernameGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, profile, loading, refreshProfile, logout } = useAuth();
  const { toast } = useToast();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  // Перед показом окна один раз сверяемся с базой: профиль в памяти мог устареть (только что
  // зарегистрировались и юзернейм уже записан) — тогда окно мигнуло бы зря.
  const [verified, setVerified] = useState(false);

  const missing = !!user && !!profile && !profile.username;

  useEffect(() => {
    if (!missing || !user) {
      setVerified(false);
      return;
    }
    let cancelled = false;
    getUserProfile(user.uid)
      .then((fresh) => {
        if (cancelled) return;
        if (fresh?.username) refreshProfile();
        else setVerified(true);
      })
      .catch(() => !cancelled && setVerified(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing, user?.uid]);

  let registering = false;
  try {
    registering = sessionStorage.getItem("registering-username") === "1";
  } catch {}

  // На страницах входа/регистрации окно не показываем — там юзернейм задаётся самим процессом.
  const onAuthPage = pathname.startsWith("/auth");

  // Пока окно «Придумай юзернейм» не нужно — показываем сайт, а поверх него (для новичков) обучение:
  // стрелки и подсказки, где указать ник, пополнить баланс и т.д. (см. OnboardingTour).
  if (loading || !missing || !verified || registering || onAuthPage) {
    return (
      <>
        <OnboardingTour />
        {children}
      </>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = usernameFormatError(value);
    if (err) {
      toast("warning", err);
      return;
    }
    setSaving(true);
    try {
      await saveMyUsername(user!.uid, value);
      await refreshProfile();
      toast("success", "Юзернейм сохранён");
    } catch (e: any) {
      if (e?.message === "username-taken") toast("warning", "Этот юзернейм уже занят");
      else if (e?.message === "invalid-format") toast("warning", "Неверный формат юзернейма");
      else toast("error", "Не удалось сохранить юзернейм. Попробуй ещё раз");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg">
      <form onSubmit={handleSubmit} className="card p-8 max-w-md w-full space-y-4">
        <AtSign className="mx-auto text-accent" size={40} />
        <h1 className="text-xl font-bold text-center">Придумай юзернейм</h1>
        <p className="text-white/60 text-sm text-center">
          Юзернейм обязателен для всех аккаунтов — это ссылка на твой профиль. Его можно будет изменить позже в профиле.
        </p>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">@</span>
          <input
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
            value={value}
            onChange={(e) => setValue(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            placeholder="my_nickname"
            className="input-field py-2.5 pl-7"
          />
        </div>
        <p className="text-[11px] text-white/30">3-20 символов: латиница, цифры, подчёркивание.</p>
        <button disabled={saving} className="btn-primary w-full py-2.5 text-sm disabled:opacity-50">
          {saving ? "Сохраняем..." : "Сохранить"}
        </button>
        <button type="button" onClick={() => logout()} className="block mx-auto text-xs text-white/40 hover:text-white/70">
          Выйти из аккаунта
        </button>
      </form>
    </div>
  );
}
