"use client";

import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Check, Copy, ExternalLink, Loader2, MessageCircle, Send, ShieldCheck, Zap } from "lucide-react";
import { auth } from "@/lib/firebase";
import { mApi } from "@/lib/messenger/client";

const authError = (code?: string) =>
  code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found" ? "Неверная почта или пароль"
  : code === "auth/too-many-requests" ? "Слишком много попыток, подожди немного" : "Не удалось войти";

function Backdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full blur-3xl opacity-40" style={{ background: "radial-gradient(circle, #ff9800, transparent 65%)" }} />
      <div className="absolute -bottom-40 -right-28 w-[480px] h-[480px] rounded-full blur-3xl opacity-35" style={{ background: "radial-gradient(circle, #ff4081, transparent 65%)" }} />
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto relative">
      <Backdrop />
      <div className="relative min-h-full flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}

function Logo({ subtitle = "Быстрый и милый мессенджер Velox Trade" }: { subtitle?: string }) {
  return (
    <div className="text-center mb-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/miligram/icon-512.png" alt="MiliGram" className="w-28 h-28 mx-auto rounded-[30px] shadow-glow" />
      <h1 className="text-3xl font-bold mt-4 tracking-tight">MiliGram</h1>
      <p className="text-white/55 text-sm mt-1">{subtitle}</p>
    </div>
  );
}

const HANDLE_OK = /^[a-z][a-z0-9_]{3,23}$/;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function checkFields(f: { name: string; handle: string; email?: string; password?: string }): string {
  if (f.name.trim().length < 2) return "Имя — минимум 2 символа";
  if (!HANDLE_OK.test(f.handle)) return "@username: 4–24 символа, только латиница, цифры и _, начинается с буквы";
  if (f.email !== undefined && !EMAIL_OK.test(f.email.trim())) return "Проверь почту — она записана неверно";
  if (f.password !== undefined && f.password.length < 8) return "Пароль — минимум 8 символов";
  return "";
}
const errText = (e: any) => (e?.message && e.message !== "Failed to fetch" ? e.message : "Нет связи с сервером. Проверь интернет и попробуй ещё раз") + (e?.status >= 500 ? ` (ошибка сервера ${e.status})` : "");

/** Нужен ли код доступа: по умолчанию НЕТ (регистрация открыта). */
function useGate() {
  const [open, setOpen] = useState(true);
  useEffect(() => { mApi<{ open: boolean }>("gate").then((d) => setOpen(d.open)).catch(() => {}); }, []);
  return open;
}
async function getGateToken(open: boolean, code: string): Promise<string | undefined> {
  if (open) return undefined;
  return (await mApi<{ gateToken: string }>("gate", { code })).gateToken;
}

/** Шаг «подтверди в Telegram»: открыть бота, нажать «Старт» — дальше всё автоматически. */
function TelegramStep({ botUrl, onCancel, poll }: { botUrl: string; onCancel: () => void; poll: () => Promise<"done" | "wait" | string> }) {
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  let botName = "";
  let startCode = "";
  try { const u = new URL(botUrl); botName = u.pathname.replace(/^\//, ""); startCode = u.searchParams.get("start") ?? ""; } catch {}
  const tgDeepLink = botName && startCode ? `tg://resolve?domain=${botName}&start=${startCode}` : "";
  const startCmd = startCode ? `/start ${startCode}` : "";
  const copy = (text: string) => {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    try { navigator.clipboard.writeText(text).then(done).catch(() => {}); } catch {}
  };
  const pollRef = useRef(poll);
  pollRef.current = poll;
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const r = await pollRef.current();
        if (r === "wait") return;
        stop = true;
        if (r !== "done") setError(r);
      } catch (e: any) { if (e?.status && e.status !== 429) { stop = true; setError(e.message || "Не удалось завершить регистрацию"); } }
    };
    const t = setInterval(tick, 2500);
    return () => { stop = true; clearInterval(t); };
  }, []);

  return (
    <Shell>
      <Logo subtitle="Остался один шаг" />
      <div className="card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-full bg-[#229ED9] flex items-center justify-center shrink-0"><Send size={18} /></span>
          <div>
            <p className="font-semibold">Подтверди аккаунт в Telegram</p>
            <p className="text-sm text-white/55 mt-0.5">Открой нашего бота и нажми «Старт» — так мы убедимся, что ты не бот, а в Telegram придут уведомления о входах. Код на почту не нужен.</p>
          </div>
        </div>
        <a href={botUrl} target="_blank" rel="noopener noreferrer" className="btn-primary w-full py-3.5 text-base flex items-center justify-center gap-2"><ExternalLink size={18} /> Открыть бота в Telegram</a>
        {tgDeepLink && <a href={tgDeepLink} className="btn-secondary w-full py-3 text-sm flex items-center justify-center gap-2"><Send size={16} /> Открыть в приложении Telegram</a>}
        <div className="rounded-btn bg-black/30 border border-white/10 p-3 space-y-2">
          <p className="text-xs text-white/50">Не открывается? Скопируй ссылку и вставь в браузер или в Telegram:</p>
          <p className="text-xs break-all text-white/80 select-all">{botUrl}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => copy(botUrl)} className="btn-secondary flex-1 py-2 text-xs flex items-center justify-center gap-1.5">{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Скопировано" : "Скопировать ссылку"}</button>
          </div>
          {startCmd && <p className="text-[11px] text-white/40">Или открой @{botName} в Telegram и отправь ему: <span className="text-white/70 select-all">{startCmd}</span></p>}
        </div>
        {error ? (
          <p className="text-sm text-red-300 text-center">{error}</p>
        ) : (
          <p className="text-sm text-white/50 flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Жду, пока ты нажмёшь «Старт» в боте…</p>
        )}
      </div>
      <button onClick={onCancel} className="block mx-auto mt-4 text-xs text-white/40">{error ? "Начать заново" : "Отмена"}</button>
    </Shell>
  );
}

export function AuthScreens() {
  const [mode, setMode] = useState<"welcome" | "login" | "register">("welcome");
  const open = useGate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tg, setTg] = useState<{ code: string; botUrl: string } | null>(null);

  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try { await signInWithEmailAndPassword(auth, email.trim(), password); }
    catch (err: any) { setError(authError(err?.code)); setBusy(false); }
  }

  async function register(e: FormEvent) {
    e.preventDefault();
    const bad = checkFields({ name, handle, email, password });
    if (bad) return setError(bad);
    setBusy(true); setError("");
    try {
      const gateToken = await getGateToken(open, code);
      setTg(await mApi<{ code: string; botUrl: string }>("signup", { gateToken, email: email.trim(), password, handle, displayName: name }));
    } catch (err: any) { console.error("signup", err); setError(errText(err)); }
    setBusy(false);
  }

  if (tg) {
    return (
      <TelegramStep
        botUrl={tg.botUrl}
        onCancel={() => { setTg(null); setMode("register"); }}
        poll={async () => {
          const r = await mApi<{ done: boolean; expired?: boolean }>(`signup?code=${encodeURIComponent(tg.code)}`);
          if (r.expired) return "Время вышло. Начни регистрацию заново.";
          if (!r.done) return "wait";
          await signInWithEmailAndPassword(auth, email.trim(), password);
          return "done";
        }}
      />
    );
  }

  if (mode === "welcome") {
    return (
      <Shell>
        <Logo />
        <div className="flex flex-wrap justify-center gap-2 mb-6">
          {([[Zap, "Быстро"], [MessageCircle, "Чаты, группы, каналы"], [ShieldCheck, "Вход с защитой"]] as const).map(([Icon, label]) => (
            <span key={label} className="flex items-center gap-1.5 text-xs bg-white/8 border border-white/10 rounded-full px-3 py-1.5 text-white/70"><Icon size={13} className="text-accent" /> {label}</span>
          ))}
        </div>
        <button onClick={() => setMode("register")} className="btn-primary w-full py-3.5 text-base mb-3">Создать аккаунт</button>
        <button onClick={() => setMode("login")} className="btn-secondary w-full py-3.5 text-base">У меня уже есть аккаунт</button>
        <p className="text-[11px] text-white/30 text-center mt-6">Сообщения не имеют сквозного шифрования: сервер технически может их читать.</p>
      </Shell>
    );
  }

  const isReg = mode === "register";
  return (
    <Shell>
      <Logo subtitle={isReg ? "Создание аккаунта" : "С возвращением"} />
      <form noValidate onSubmit={isReg ? register : login} className="card p-5 space-y-3">
        {isReg && (
          <>
            <input autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" maxLength={40} className="input-field" required />
            <input autoComplete="off" value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/^@/, ""))} placeholder="@username (латиница, 4–24)" maxLength={24} className="input-field" required />
          </>
        )}
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Почта" className="input-field" required />
        <input type="password" autoComplete={isReg ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isReg ? "Пароль (от 8 символов)" : "Пароль"} className="input-field" required />
        {isReg && !open && <input autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Код доступа" className="input-field" required />}
        {isReg && <p className="text-xs text-white/40 flex gap-1.5"><Send size={13} className="shrink-0 mt-0.5 text-[#229ED9]" /> Следующим шагом нужно будет подтвердить аккаунт через Telegram-бота.</p>}
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full py-3.5 text-base flex items-center justify-center gap-2 disabled:opacity-60">
          {busy && <Loader2 size={18} className="animate-spin" />} {isReg ? "Продолжить" : "Войти"}
        </button>
      </form>
      <button onClick={() => { setMode(isReg ? "login" : "register"); setError(""); }} className="block mx-auto mt-4 text-sm text-accent">
        {isReg ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Создать"}
      </button>
      <button onClick={() => { setMode("welcome"); setError(""); }} className="block mx-auto mt-2 text-xs text-white/40">Назад</button>
    </Shell>
  );
}

/** Человек уже вошёл на сайте Velox, но аккаунта MiliGram нет: имя, @username и подтверждение Telegram-ботом. */
export function JoinScreen({ defaultName, onLogout }: { defaultName: string; onLogout: () => void }) {
  const open = useGate();
  const [name, setName] = useState(defaultName);
  const [handle, setHandle] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [botUrl, setBotUrl] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const gateRef = useRef<string | undefined>(undefined);

  async function join(e?: FormEvent) {
    e?.preventDefault();
    const bad = checkFields({ name, handle });
    if (bad) return setError(bad);
    setBusy(true); setError("");
    try {
      gateRef.current = gateRef.current ?? (await getGateToken(open, code));
      const r = await mApi<{ ok?: boolean; needTelegram?: boolean; botUrl?: string }>("join", { gateToken: gateRef.current, handle, displayName: name });
      if (r.needTelegram && r.botUrl) setBotUrl(r.botUrl);
      else if (r.ok) { setDone(true); return; } // аккаунт создан: MessengerApp подхватит его сам (onSnapshot)
      else setError("Сервер не вернул ссылку на бота. Попробуй ещё раз");
    } catch (err: any) { console.error("join", err); setError(errText(err)); }
    setBusy(false);
  }

  if (done) {
    return (
      <Shell>
        <Logo subtitle="Аккаунт создан" />
        <p className="text-sm text-white/60 text-center flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Открываю мессенджер…</p>
        <button onClick={() => window.location.reload()} className="block mx-auto mt-4 text-xs text-white/40">Не открылось? Обновить</button>
      </Shell>
    );
  }
  if (botUrl) {
    return (
      <TelegramStep
        botUrl={botUrl}
        onCancel={() => setBotUrl(null)}
        poll={async () => {
          const r = await mApi<{ telegramLinked: boolean }>("join");
          if (!r.telegramLinked) return "wait";
          await mApi("join", { gateToken: gateRef.current, handle, displayName: name });
          setDone(true);
          return "done";
        }}
      />
    );
  }
  return (
    <Shell>
      <Logo subtitle="Ещё один шаг" />
      <form noValidate onSubmit={join} className="card p-5 space-y-3">
        <p className="text-sm text-white/60">Выбери имя и @username для MiliGram. Затем подтвердим аккаунт через Telegram-бота.</p>
        <input autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" maxLength={40} className="input-field" required />
        <input autoComplete="off" value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/^@/, ""))} placeholder="@username (латиница, 4–24)" maxLength={24} className="input-field" required />
        {!open && <input autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Код доступа" className="input-field" required />}
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full py-3.5 text-base disabled:opacity-60">{busy ? "..." : "Продолжить"}</button>
      </form>
      <button onClick={onLogout} className="block mx-auto mt-4 text-xs text-white/40">Выйти из аккаунта</button>
    </Shell>
  );
}
