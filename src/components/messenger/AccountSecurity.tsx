"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { ChevronRight, KeyRound, Loader2, Send } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { mApi, MApiError } from "./api";
import { IconBox, Sheet } from "./ui";

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isServiceEmail = (e?: string | null) => !e || e.endsWith("@telegram.local");
const authMsg = (code?: string) =>
  code === "auth/wrong-password" || code === "auth/invalid-credential" ? "Текущий пароль неверный"
  : code === "auth/too-many-requests" ? "Слишком много попыток, подожди немного"
  : code === "auth/weak-password" ? "Слишком простой пароль" : "Не удалось сохранить пароль";

/** «Вход и пароль» в настройках: сменить пароль / добавить почту и пароль (если вошёл через Telegram) и привязать Telegram. */
export function AccountSecurity() {
  const { user, resetPassword } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const noPassword = isServiceEmail(user?.email); // регистрация только через Telegram: настоящей почты и пароля ещё нет

  // --- пароль ---
  const [email, setEmail] = useState("");
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (pw.length < 8) return setError("Пароль — минимум 8 символов");
    if (pw !== pw2) return setError("Пароли не совпадают");
    if (noPassword && !EMAIL_OK.test(email.trim())) return setError("Проверь почту — она записана неверно");
    if (!noPassword && !cur) return setError("Введи текущий пароль");
    setBusy(true);
    try {
      if (noPassword) {
        await mApi("credentials", { email: email.trim(), password: pw });
        toast("success", "Готово! Теперь можно входить и по почте с паролем");
        await auth.currentUser?.reload().catch(() => {});
      } else {
        const u = auth.currentUser;
        if (!u?.email) throw new Error("no-email");
        await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, cur));
        await updatePassword(u, pw);
        toast("success", "Пароль изменён");
      }
      setCur(""); setPw(""); setPw2(""); setEmail("");
    } catch (err: any) {
      setError(err instanceof MApiError ? err.message : authMsg(err?.code));
    }
    setBusy(false);
  }

  async function forgot() {
    if (!user?.email || noPassword) return;
    try { await resetPassword(user.email); toast("success", `Ссылка для нового пароля отправлена на ${user.email}`); }
    catch { toast("error", "Не удалось отправить письмо"); }
  }

  // --- Telegram ---
  const [tg, setTg] = useState<{ linked: boolean; username?: string | null } | null>(null);
  const [waiting, setWaiting] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadTg = useCallback(async () => {
    try { const r = await mApi<{ linked: boolean; conflict?: boolean; username?: string | null }>("telegram-link"); setTg(r); return r; } catch { return null; }
  }, []);
  useEffect(() => { if (open) loadTg(); return () => { if (timer.current) clearInterval(timer.current); }; }, [open, loadTg]);

  async function linkTelegram() {
    setWaiting(true);
    try {
      const r = await mApi<{ botUrl: string }>("telegram-link", {});
      window.open(r.botUrl, "_blank", "noopener,noreferrer");
      let tries = 0;
      timer.current = setInterval(async () => {
        const s = await loadTg();
        if (s?.linked) { clearInterval(timer.current!); setWaiting(false); toast("success", "Telegram привязан"); }
        else if (s && (s as { conflict?: boolean }).conflict) { clearInterval(timer.current!); setWaiting(false); toast("error", "Этот Telegram уже привязан к другому аккаунту MiliGram"); }
        else if (++tries > 120) { clearInterval(timer.current!); setWaiting(false); }
      }, 2500);
    } catch (err) {
      setWaiting(false);
      toast("error", err instanceof MApiError ? err.message : "Не удалось открыть бота");
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="w-full flex items-center gap-3.5 px-4 py-3 text-left active:bg-white/5">
        <IconBox color="#8e8e93"><KeyRound size={17} /></IconBox>
        <span className="flex-1 text-[16px]">Вход и пароль</span>
        <ChevronRight size={18} className="mx-muted" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Вход и пароль" full>
        <div className="mx-scroll flex-1 min-h-0 px-4 pb-8 space-y-5">
          <form noValidate onSubmit={savePassword} className="space-y-3">
            <p className="font-semibold px-1">{noPassword ? "Добавить почту и пароль" : "Сменить пароль"}</p>
            {noPassword ? (
              <>
                <p className="mx-muted text-[13px] px-1">Сейчас ты входишь через Telegram. Добавь почту и пароль — и можно будет входить и так, а пароль потом получится сбросить через почту.</p>
                <div className="mx-card"><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Почта" className="w-full px-4 py-3 bg-transparent outline-none text-[16px]" /></div>
              </>
            ) : (
              <div className="mx-card"><input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="Текущий пароль" className="w-full px-4 py-3 bg-transparent outline-none text-[16px]" /></div>
            )}
            <div className="mx-card">
              <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Новый пароль (от 8 символов)" className="w-full px-4 py-3 bg-transparent outline-none text-[16px]" />
              <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Повтори новый пароль" className="w-full px-4 py-3 bg-transparent outline-none text-[16px]" style={{ borderTop: "1px solid var(--mx-line)" }} />
            </div>
            {error && <p className="text-[14px] px-1" style={{ color: "var(--mx-danger)" }}>{error}</p>}
            <button type="submit" disabled={busy} className="mx-btn w-full flex items-center justify-center gap-2">{busy && <Loader2 size={17} className="animate-spin" />} {noPassword ? "Сохранить" : "Изменить пароль"}</button>
            {!noPassword && <button type="button" onClick={forgot} className="block mx-auto text-[13px]" style={{ color: "var(--mx-accent)" }}>Не помню текущий пароль — отправить ссылку на почту</button>}
          </form>

          <div className="space-y-2">
            <p className="font-semibold px-1">Telegram</p>
            {tg?.linked ? (
              <p className="mx-muted text-[14px] px-1">Привязан{tg.username ? ` (@${tg.username})` : ""}. Можно входить через Telegram.</p>
            ) : (
              <>
                <p className="mx-muted text-[13px] px-1">Необязательно: привяжи Telegram, чтобы получать уведомления о входах и входить в один тап.</p>
                <button onClick={linkTelegram} disabled={waiting} className="mx-btn w-full flex items-center justify-center gap-2" style={{ background: "#2AABEE", color: "#fff" }}>
                  {waiting ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />} {waiting ? "Жду «Старт» в боте…" : "Привязать Telegram"}
                </button>
              </>
            )}
          </div>
        </div>
      </Sheet>
    </>
  );
}
