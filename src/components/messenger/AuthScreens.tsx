"use client";

import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Check, Copy, ExternalLink, Eye, EyeOff, Loader2, Send } from "lucide-react";
import { auth } from "@/lib/firebase";
import { mApi } from "@/lib/messenger/client";
import "./auth-slasher.css";

const authError = (code?: string) =>
  code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found" ? "Неверная почта или пароль"
  : code === "auth/too-many-requests" ? "Слишком много попыток, подожди немного" : "Не удалось войти";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="sl-auth">
      <div className="sl-wrap">
        <div className="sl-col">{children}</div>
      </div>
    </div>
  );
}

function Logo({ subtitle = "Быстрый и милый мессенджер Velox Trade" }: { subtitle?: string }) {
  return (
    <div className="sl-logo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/miligram/icon-512.png" alt="MiliGram" />
      <h1 className="sl-title">MiliGram</h1>
      <p className="sl-sub">{subtitle}</p>
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

const RU_MAP: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
/** @username подбирается сам из имени/почты (имя → латиница + 4 цифры) — человеку не нужно ничего придумывать. */
function handleBase(name: string, email = ""): string {
  const src = (name.trim() || email.split("@")[0] || "user").toLowerCase();
  let base = [...src].map((ch) => RU_MAP[ch] ?? ch).join("").replace(/[^a-z0-9_]/g, "").replace(/^[^a-z]+/, "");
  if (base.length < 3) base = "user" + base;
  return base.slice(0, 18);
}
function suggestHandle(name: string, email = ""): string {
  return handleBase(name, email) + String(Math.floor(1000 + Math.random() * 9000));
}
const handleTaken = (e: any) => e?.status === 409 && /username/i.test(String(e?.message ?? ""));

function PasswordField({ value, onChange, placeholder, autoComplete }: { value: string; onChange: (v: string) => void; placeholder: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input type={show ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input-field pr-12" required />
      <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 p-1" aria-label={show ? "Скрыть пароль" : "Показать пароль"}>
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

function HandleLine({ handle, edited, onEdit, onChange }: { handle: string; edited: boolean; onEdit: () => void; onChange: (v: string) => void }) {
  if (edited) {
    return <input autoComplete="off" value={handle} onChange={(e) => onChange(e.target.value.toLowerCase().replace(/^@/, ""))} placeholder="@username (латиница, 4–24)" maxLength={24} className="input-field" autoCapitalize="none" />;
  }
  return (
    <p className="text-xs text-white/45 flex items-center gap-1.5">
      Твой @username: <span className="text-white/75 font-medium">@{handle}</span>
      <button type="button" onClick={onEdit} className="text-accent ml-auto">изменить</button>
    </p>
  );
}

export function AuthScreens() {
  const [mode, setMode] = useState<"login" | "register">("register");
  const open = useGate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleEdited, setHandleEdited] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tg, setTg] = useState<{ code: string; botUrl: string } | null>(null);

  // пока человек не менял @username вручную — показываем предложенный по имени
  const shownHandle = handleEdited ? handle : handleBase(name, email) + "••••";

  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try { await signInWithEmailAndPassword(auth, email.trim(), password); }
    catch (err: any) { setError(authError(err?.code)); setBusy(false); }
  }

  async function register(e: FormEvent) {
    e.preventDefault();
    const bad = checkFields({ name, handle: handleEdited ? handle : "aaaa", email, password });
    if (bad) return setError(bad);
    setBusy(true); setError("");
    try {
      const gateToken = await getGateToken(open, code);
      let h = handleEdited ? handle : suggestHandle(name, email);
      for (let attempt = 0; ; attempt++) {
        try {
          setTg(await mApi<{ code: string; botUrl: string }>("signup", { gateToken, email: email.trim(), password, handle: h, displayName: name.trim() }));
          break;
        } catch (err: any) {
          // автоподбор: если такой @username занят — тихо пробуем другой (вручную введённый не трогаем)
          if (!handleEdited && handleTaken(err) && attempt < 4) { h = suggestHandle(name, email); continue; }
          throw err;
        }
      }
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

  const isReg = mode === "register";
  return (
    <Shell>
      <Logo subtitle={isReg ? "Создай аккаунт за полминуты" : "С возвращением"} />
      <div className="sl-tabs">
        {([["register", "Регистрация"], ["login", "Вход"]] as const).map(([m, label]) => (
          <button key={m} type="button" onClick={() => { setMode(m); setError(""); }} className={`sl-tab ${mode === m ? "sl-tab-on" : ""}`}>{label}</button>
        ))}
      </div>
      <form noValidate onSubmit={isReg ? register : login} className="card p-5 space-y-3">
        {isReg && <input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Как тебя зовут?" maxLength={40} className="input-field" required />}
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Почта" className="input-field" required />
        <PasswordField value={password} onChange={setPassword} autoComplete={isReg ? "new-password" : "current-password"} placeholder={isReg ? "Пароль (от 8 символов)" : "Пароль"} />
        {isReg && (
          <HandleLine handle={shownHandle} edited={handleEdited} onEdit={() => { setHandle(suggestHandle(name, email)); setHandleEdited(true); }} onChange={setHandle} />
        )}
        {isReg && !open && <input autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Код доступа" className="input-field" required />}
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full py-3.5 text-base flex items-center justify-center gap-2 disabled:opacity-60">
          {busy && <Loader2 size={18} className="animate-spin" />} {isReg ? "Создать аккаунт" : "Войти"}
        </button>
        {isReg && <p className="text-[11.5px] text-white/40 flex gap-1.5 justify-center"><Send size={12} className="shrink-0 mt-0.5 text-[#229ED9]" /> В конце — один клик «Старт» в Telegram-боте.</p>}
      </form>
    </Shell>
  );
}

/** Человек уже вошёл на сайте Velox, но аккаунта MiliGram нет: одно нажатие «Продолжить» (имя и @username уже подобраны). */
export function JoinScreen({ defaultName, onLogout }: { defaultName: string; onLogout: () => void }) {
  const open = useGate();
  const [name, setName] = useState(defaultName);
  const [handle, setHandle] = useState(() => suggestHandle(defaultName));
  const [handleEdited, setHandleEdited] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [botUrl, setBotUrl] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const gateRef = useRef<string | undefined>(undefined);
  const handleRef = useRef(handle);

  async function join(e?: FormEvent) {
    e?.preventDefault();
    const bad = checkFields({ name, handle });
    if (bad) return setError(bad);
    setBusy(true); setError("");
    try {
      gateRef.current = gateRef.current ?? (await getGateToken(open, code));
      let h = handle;
      for (let attempt = 0; ; attempt++) {
        try {
          handleRef.current = h;
          const r = await mApi<{ ok?: boolean; needTelegram?: boolean; botUrl?: string }>("join", { gateToken: gateRef.current, handle: h, displayName: name.trim() });
          if (r.needTelegram && r.botUrl) setBotUrl(r.botUrl);
          else if (r.ok) { setDone(true); return; } // аккаунт создан: MessengerApp подхватит его сам (onSnapshot)
          else setError("Сервер не вернул ссылку на бота. Попробуй ещё раз");
          break;
        } catch (err: any) {
          if (!handleEdited && handleTaken(err) && attempt < 4) { h = suggestHandle(name); setHandle(h); continue; }
          throw err;
        }
      }
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
          await mApi("join", { gateToken: gateRef.current, handle: handleRef.current, displayName: name.trim() });
          setDone(true);
          return "done";
        }}
      />
    );
  }
  return (
    <Shell>
      <Logo subtitle={`Привет${name.trim() ? ", " + name.trim().split(" ")[0] : ""}! Остался один шаг`} />
      <form noValidate onSubmit={join} className="card p-5 space-y-3">
        <input autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} placeholder="Как тебя зовут?" maxLength={40} className="input-field" required />
        <HandleLine handle={handle} edited={handleEdited} onEdit={() => setHandleEdited(true)} onChange={setHandle} />
        {!open && <input autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Код доступа" className="input-field" required />}
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full py-3.5 text-base flex items-center justify-center gap-2 disabled:opacity-60">
          {busy && <Loader2 size={18} className="animate-spin" />} Продолжить
        </button>
      </form>
      <button onClick={onLogout} className="block mx-auto mt-4 text-xs text-white/40">Выйти из аккаунта</button>
    </Shell>
  );
}
