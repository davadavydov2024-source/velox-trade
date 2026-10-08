"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { UserPlus, X, Loader2, Trash2, ChevronRight, Users } from "lucide-react";
import {
  SavedAccount,
  getSavedAccounts,
  getLoadedSlotId,
  switchAccount,
  removeAccount,
  addAccountByEmail,
  addAccountByGoogle,
  MAX_ACCOUNTS,
} from "@/lib/multiAccount";
import { subscribeAccounts } from "@/lib/accountSlots";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { safeImageSrc } from "@/lib/safeImage";

function initialsOf(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

function AddAccountModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("email");
    try {
      await addAccountByEmail(email.trim(), password);
      toast("success", "Аккаунт добавлен, переключаемся...");
      window.location.href = "/profile";
    } catch (err: any) {
      const code = err?.code as string | undefined;
      setError(
        code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found"
          ? "Неверный email или пароль"
          : code === "auth/too-many-requests"
            ? "Слишком много попыток — попробуй позже"
            : err?.message || "Не удалось войти"
      );
      setBusy(null);
    }
  }

  async function handleGoogle() {
    setError(null);
    setBusy("google");
    try {
      await addAccountByGoogle();
      toast("success", "Аккаунт добавлен, переключаемся...");
      window.location.href = "/profile";
    } catch (err: any) {
      const code = err?.code as string | undefined;
      // Человек сам закрыл окно Google — это не ошибка, молча возвращаемся к форме.
      setError(code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request" ? null : err?.message || "Не удалось войти через Google");
      setBusy(null);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="auth-card-rise auth-glow-border rounded-card" onClick={(e) => e.stopPropagation()}>
      <div className="card w-full max-w-sm p-5 relative overflow-hidden z-[1]">
        <div
          className="absolute top-0 left-0 right-0 h-[2px] opacity-70"
          style={{ background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)" }}
        />
        <div className="flex items-center justify-between mb-4">
          <p
            className="font-semibold auth-title-sheen bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(90deg, #fff, var(--color-accent-light), #fff)" }}
          >
            Добавить аккаунт
          </p>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy !== null}
          className="btn-secondary w-full py-2.5 mb-3 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {busy === "google" ? <Loader2 size={16} className="animate-spin" /> : null}
          Войти через Google
        </button>

        <div className="flex items-center gap-2 text-xs text-white/30 mb-3">
          <div className="h-px bg-white/10 flex-1" /> или email <div className="h-px bg-white/10 flex-1" />
        </div>

        <form onSubmit={handleEmailSubmit} className="space-y-2.5">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field w-full focus:ring-2 focus:ring-accent/30 transition-shadow"
            autoComplete="username"
          />
          <input
            type="password"
            required
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field w-full focus:ring-2 focus:ring-accent/30 transition-shadow"
            autoComplete="current-password"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy !== null}
            className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 disabled:opacity-50 hover:shadow-[0_0_24px_-4px_var(--color-accent)] transition-shadow"
          >
            {busy === "email" ? <Loader2 size={16} className="animate-spin" /> : null}
            Войти и добавить
          </button>
        </form>
      </div>
      </div>
    </div>,
    document.body
  );
}

export function AccountSwitcher() {
  const { user, profile } = useAuth();
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [loadedSlot, setLoadedSlot] = useState<string>("primary");
  const [showAdd, setShowAdd] = useState(false);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [confirmSlot, setConfirmSlot] = useState<string | null>(null);

  useEffect(() => {
    setLoadedSlot(getLoadedSlotId());
    setAccounts(getSavedAccounts());
    // Список обновляется сам (новый вход, смена ника/аватара, правки из другой вкладки).
    return subscribeAccounts(() => setAccounts(getSavedAccounts()));
  }, []);

  // Активный аккаунт показываем по живому профилю, даже если в сохранённом списке его ещё нет.
  const list: SavedAccount[] = (() => {
    const base = accounts.map((a) =>
      a.slotId === loadedSlot && user && profile
        ? { ...a, displayName: profile.displayName, photoURL: profile.photoURL ?? a.photoURL }
        : a
    );
    if (user && profile && !base.some((a) => a.slotId === loadedSlot)) {
      base.unshift({ slotId: loadedSlot, uid: user.uid, email: user.email ?? profile.email, displayName: profile.displayName, photoURL: profile.photoURL ?? undefined });
    }
    return base;
  })();

  if (!user) return null;

  async function handleRemove(slotId: string) {
    setBusySlot(slotId);
    try {
      await removeAccount(slotId);
      setAccounts(getSavedAccounts());
    } finally {
      setBusySlot(null);
      setConfirmSlot(null);
    }
  }

  function handleSwitch(slotId: string) {
    setBusySlot(slotId);
    switchAccount(slotId); // перезагрузка страницы — спиннер остаётся до неё
  }

  return (
    <div className="rounded-card border border-white/[0.06] bg-white/[0.02] p-2 space-y-1">
      <div className="flex items-center justify-between px-2 pt-1 pb-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 flex items-center gap-1.5">
          <Users size={11} /> Аккаунты
        </p>
        <span className="text-[10px] text-white/25">
          {list.length}/{MAX_ACCOUNTS}
        </span>
      </div>

      {list.map((acc) => {
        const isActive = acc.slotId === loadedSlot;
        const busy = busySlot === acc.slotId;
        const confirming = confirmSlot === acc.slotId;
        return (
          <div
            key={acc.slotId}
            className={`group relative flex items-center gap-2.5 pl-2.5 pr-2 py-2 rounded-btn transition-all duration-150 ${
              isActive ? "bg-accent/12 ring-1 ring-accent/30" : "hover:bg-white/[0.04]"
            }`}
          >
            <button
              type="button"
              onClick={() => !isActive && !busy && handleSwitch(acc.slotId)}
              disabled={isActive || busySlot !== null}
              className="flex items-center gap-2.5 flex-1 min-w-0 text-left disabled:cursor-default"
            >
              <div
                className={`relative w-9 h-9 rounded-full overflow-hidden flex-none flex items-center justify-center text-sm font-bold transition-all ${
                  isActive ? "ring-2 ring-accent shadow-[0_0_14px_-2px_var(--color-accent)]" : "ring-1 ring-white/10 group-hover:ring-white/25"
                }`}
                style={!acc.photoURL ? { background: "linear-gradient(135deg, var(--color-accent), #4a6cf7)", color: "#000" } : undefined}
              >
                {acc.photoURL ? <Image src={safeImageSrc(acc.photoURL)} alt="" fill className="object-cover" sizes="36px" /> : initialsOf(acc.displayName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-tight">{acc.displayName}</p>
                <p className="text-[11px] text-white/40 truncate leading-tight">{acc.email}</p>
              </div>
              {isActive ? (
                <span className="flex-none text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent text-black">Сейчас</span>
              ) : busy ? (
                <Loader2 size={15} className="animate-spin text-accent flex-none" />
              ) : (
                <ChevronRight size={15} className="text-white/20 group-hover:text-white/60 flex-none transition-colors" />
              )}
            </button>

            {!isActive &&
              (confirming ? (
                <button
                  type="button"
                  onClick={() => handleRemove(acc.slotId)}
                  disabled={busySlot !== null}
                  className="flex-none text-[11px] font-semibold px-2 py-1 rounded-md bg-red-500/15 text-red-400 hover:bg-red-500/25 disabled:opacity-40"
                >
                  Убрать?
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmSlot(acc.slotId)}
                  disabled={busySlot !== null}
                  className="flex-none p-1.5 rounded-md text-white/20 hover:text-red-400 hover:bg-red-400/10 disabled:opacity-40 transition-colors"
                  aria-label="Убрать аккаунт из списка"
                >
                  <Trash2 size={14} />
                </button>
              ))}
          </div>
        );
      })}

      {list.length < MAX_ACCOUNTS && (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-btn text-sm text-white/50 hover:bg-white/[0.04] hover:text-white w-full transition-colors"
        >
          <div className="w-9 h-9 rounded-full border border-dashed border-white/20 flex items-center justify-center flex-none">
            <UserPlus size={15} />
          </div>
          Добавить аккаунт
        </button>
      )}

      {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}
