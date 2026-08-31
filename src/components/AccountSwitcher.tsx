"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { UserPlus, X, Check, Loader2, Trash2 } from "lucide-react";
import {
  SavedAccount,
  getSavedAccounts,
  getActiveSlotId,
  switchAccount,
  removeAccount,
  addAccountByEmail,
  addAccountByGoogle,
  MAX_ACCOUNTS,
  goToProfileHard,
} from "@/lib/multiAccount";
import { useToast } from "@/lib/toastContext";

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
      // Небольшая пауза перед window.location.href: раньше редирект стартовал в ту же
      // микрозадачу, что и toast(...) — тост физически не успевал отрисоваться ни на один
      // кадр до того, как браузер начинал перезагрузку страницы, и выглядело так, будто
      // ничего не произошло (хотя аккаунт на самом деле уже добавился).
      toast("success", "Аккаунт добавлен, переключаемся...");
      setTimeout(() => {
        goToProfileHard();
      }, 500);
    } catch (err: any) {
      const code = err?.code;
      const message =
        code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found"
          ? "Неверный email или пароль"
          : code === "auth/too-many-requests"
            ? "Слишком много попыток входа — подожди немного и попробуй снова"
            : code === "auth/user-disabled"
              ? "Этот аккаунт заблокирован"
              : err?.message || "Не удалось войти";
      setError(message);
      setBusy(null);
    }
  }

  async function handleGoogle() {
    setError(null);
    setBusy("google");
    try {
      await addAccountByGoogle();
      toast("success", "Аккаунт добавлен, переключаемся...");
      setTimeout(() => {
        goToProfileHard();
      }, 500);
    } catch (err: any) {
      if (err?.message) setError(err.message); // пустое сообщение — юзер сам закрыл попап, молчим
      setBusy(null);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold">Добавить аккаунт</p>
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
            className="input-field w-full"
            autoComplete="username"
          />
          <input
            type="password"
            required
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field w-full"
            autoComplete="current-password"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button type="submit" disabled={busy !== null} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 disabled:opacity-50">
            {busy === "email" ? <Loader2 size={16} className="animate-spin" /> : null}
            Войти и добавить
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
}

export function AccountSwitcher() {
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [activeSlot, setActiveSlot] = useState<string>("primary");
  const [showAdd, setShowAdd] = useState(false);
  const [removingSlot, setRemovingSlot] = useState<string | null>(null);

  useEffect(() => {
    setAccounts(getSavedAccounts());
    setActiveSlot(getActiveSlotId());
  }, []);

  if (accounts.length === 0) return null; // до первой загрузки профиля список ещё пуст

  async function handleRemove(slotId: string) {
    setRemovingSlot(slotId);
    try {
      await removeAccount(slotId); // сам сделает reload, если удаляли активный
      setAccounts(getSavedAccounts());
    } finally {
      setRemovingSlot(null);
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-white/30 uppercase tracking-wide px-1">Аккаунты</p>
      {accounts.map((acc) => {
        const isActive = acc.slotId === activeSlot;
        return (
          <div
            key={acc.slotId}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-btn text-sm ${isActive ? "bg-accent/15" : "hover:bg-white/5"}`}
          >
            <button
              type="button"
              onClick={() => switchAccount(acc.slotId)}
              className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
              title={isActive ? "Обновить сессию этого аккаунта" : "Переключиться на этот аккаунт"}
            >
              <div className="relative w-7 h-7 rounded-full overflow-hidden bg-accent/20 flex-none flex items-center justify-center text-xs font-semibold text-accent">
                {acc.photoURL ? <Image src={acc.photoURL} alt="" fill className="object-cover" sizes="28px" /> : initialsOf(acc.displayName)}
              </div>
              <div className="min-w-0">
                <p className="truncate leading-tight">{acc.displayName}</p>
                <p className="text-[11px] text-white/40 truncate leading-tight">{acc.email}</p>
              </div>
            </button>
            {isActive ? (
              <Check size={15} className="text-accent flex-none" />
            ) : (
              <button
                type="button"
                onClick={() => handleRemove(acc.slotId)}
                disabled={removingSlot === acc.slotId}
                className="text-white/25 hover:text-red-400 flex-none p-1 disabled:opacity-40"
                aria-label="Убрать аккаунт из списка"
              >
                {removingSlot === acc.slotId ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            )}
          </div>
        );
      })}

      {accounts.length < MAX_ACCOUNTS && (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2.5 px-3 py-2 rounded-btn text-sm text-white/50 hover:bg-white/5 hover:text-white w-full"
        >
          <div className="w-7 h-7 rounded-full border border-dashed border-white/20 flex items-center justify-center flex-none">
            <UserPlus size={14} />
          </div>
          Добавить аккаунт
        </button>
      )}

      {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}
