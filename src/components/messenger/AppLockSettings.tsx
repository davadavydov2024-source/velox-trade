"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Fingerprint, Loader2, Lock } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { IconBox, Sheet, Switch } from "./ui";
import { PinPad } from "./PinPad";
import { biometricSupported, hasBio, hasPin, hashPin, loadLock, lockNow, LOCK_TIMEOUTS, LockConfig, LockMode, newSalt, registerBiometric, saveLock, verifyBiometric, verifyPin } from "./appLock";
import "./applock.css";

type Step = null | "new" | "confirm" | "verify-off" | "verify-change";

const modeLabel = (c: LockConfig | null) =>
  !c ? "Выкл." : c.mode === "pin" ? "Код-пароль" : c.mode === "bio" ? "Face ID / отпечаток" : "Код + Face ID";

/** «Код-пароль и Face ID» в настройках: выбрать, чем закрывать мессенджер при входе — кодом, биометрией или и тем и другим. */
export function AppLockSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const uid = user?.uid ?? "";
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<LockConfig | null>(null);
  const [bioOk, setBioOk] = useState(false);
  const [step, setStep] = useState<Step>(null);
  const [draft, setDraft] = useState("");
  const [pendingMode, setPendingMode] = useState<LockMode | null>(null);
  const [pendingCred, setPendingCred] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");

  useEffect(() => {
    if (!uid) return;
    const load = () => setCfg(loadLock(uid));
    load();
    biometricSupported().then(setBioOk);
    window.addEventListener("mx-lock-changed", load);
    return () => window.removeEventListener("mx-lock-changed", load);
  }, [uid]);

  const name = user?.displayName || user?.email || uid;
  const timeout = cfg?.timeout ?? 60;

  const cancel = () => { setStep(null); setDraft(""); setPendingMode(null); setPendingCred(undefined); setHint(""); };

  // ---- включение: выбрали способ ----
  const startSetup = async (mode: LockMode) => {
    setHint("");
    let credId: string | undefined;
    if (mode !== "pin") {
      // биометрию регистрируем СРАЗУ, пока не пропал жест нажатия: некоторые браузеры (Safari) иначе не покажут Face ID
      setBusy(true);
      try { credId = await registerBiometric(uid, name); }
      catch { setBusy(false); return toast("error", "Не удалось включить Face ID / отпечаток. Проверь, что он настроен на устройстве"); }
      setBusy(false);
    }
    if (mode === "bio") {
      saveLock(uid, { mode: "bio", credId, timeout });
      return toast("success", "Face ID / отпечаток включён");
    }
    setPendingMode(mode); setPendingCred(credId); setDraft(""); setStep("new");
  };

  // ---- ввод нового кода дважды ----
  const onNew = (pin: string) => { setDraft(pin); setHint(""); setStep("confirm"); return true; };
  const onConfirm = async (pin: string) => {
    if (pin !== draft) { setHint("Коды не совпали — введи новый код ещё раз"); setStep("new"); return false; }
    const salt = newSalt();
    const pinHash = await hashPin(pin, salt);
    const mode: LockMode = pendingMode ?? cfg?.mode ?? "pin";
    saveLock(uid, { mode, salt, pinHash, credId: pendingCred ?? cfg?.credId, timeout });
    toast("success", pendingMode ? "Блокировка включена" : "Код изменён");
    cancel();
    return true;
  };

  // ---- проверка текущего кода перед отключением / сменой ----
  const onVerify = async (pin: string) => {
    if (!cfg || !(await verifyPin(cfg, pin))) { setHint("Неверный код"); return false; }
    if (step === "verify-off") { saveLock(uid, null); toast("success", "Блокировка выключена"); cancel(); }
    else { setPendingMode(null); setDraft(""); setHint(""); setStep("new"); }
    return true;
  };
  const askVerify = async (what: "verify-off" | "verify-change") => {
    if (hasPin(cfg)) { setHint(""); setStep(what); return; }
    // только биометрия — подтверждаем ею
    if (cfg?.credId && (await verifyBiometric(cfg.credId))) {
      if (what === "verify-off") { saveLock(uid, null); toast("success", "Блокировка выключена"); }
    } else toast("error", "Не удалось подтвердить");
  };

  // ---- Face ID поверх кода и обратно ----
  const toggleBio = async (on: boolean) => {
    if (!cfg) return;
    if (!on) { if (hasPin(cfg)) saveLock(uid, { ...cfg, mode: "pin", credId: undefined }); return; }
    setBusy(true);
    try { const credId = await registerBiometric(uid, name); saveLock(uid, { ...cfg, mode: "both", credId }); toast("success", "Face ID / отпечаток включён"); }
    catch { toast("error", "Не удалось включить Face ID / отпечаток"); }
    setBusy(false);
  };
  const addPin = () => { setPendingMode("both"); setPendingCred(cfg?.credId); setDraft(""); setHint(""); setStep("new"); };
  const setTimeoutV = (v: number) => cfg && saveLock(uid, { ...cfg, timeout: v });

  const close = useCallback(() => { cancel(); setOpen(false); }, []);

  const overlay = step && (
    <div className="al-wrap" style={{ zIndex: 600, position: "fixed" }}>
      <div className="al-ava"><Lock size={34} color="#fff" /></div>
      <h1 className="al-title">
        {step === "new" ? (pendingMode || !hasPin(cfg) ? "Придумай код-пароль" : "Новый код-пароль") : step === "confirm" ? "Повтори код" : "Введи текущий код"}
      </h1>
      <p className={`al-sub ${hint ? "err" : ""}`}>{hint || (step === "new" ? "4 цифры — их нужно будет вводить при входе" : "")}</p>
      <PinPad key={step} onComplete={step === "new" ? onNew : step === "confirm" ? onConfirm : onVerify} />
      <button type="button" className="al-link" onClick={cancel}>Отмена</button>
    </div>
  );

  return (
    <>
      <button onClick={() => setOpen(true)} className="w-full flex items-center gap-3.5 px-4 py-3 text-left active:bg-white/5">
        <IconBox color="#34c759"><Lock size={17} /></IconBox>
        <span className="flex-1 text-[16px]">Код-пароль и Face ID</span>
        <span className="mx-muted text-[15px]">{modeLabel(cfg)}</span>
        <ChevronRight size={18} className="mx-muted" />
      </button>

      <Sheet open={open} onClose={close} title="Блокировка мессенджера" full>
        <div className="mx-scroll flex-1 min-h-0 px-4 pb-8 space-y-5">
          {!cfg ? (
            <>
              <p className="mx-muted text-[14px] px-1">Закрой мессенджер, чтобы переписку не увидели, если телефон или компьютер возьмут без тебя. Выбери, как разблокировать:</p>
              <div className="mx-card">
                <Option icon={<Lock size={18} />} title="Код-пароль" text="4 цифры при каждом входе" onClick={() => startSetup("pin")} />
                <Option icon={<Fingerprint size={18} />} title="Face ID / отпечаток" text={bioOk ? "Разблокировка лицом, пальцем или Windows Hello" : "Недоступно в этом браузере или на этом устройстве"} disabled={!bioOk || busy} onClick={() => startSetup("bio")} />
                <Option icon={<><Lock size={16} /><Fingerprint size={16} /></>} title="Код-пароль + Face ID" text={bioOk ? "Быстро по лицу или пальцу, а код — запасной способ" : "Face ID здесь недоступен"} disabled={!bioOk || busy} onClick={() => startSetup("both")} />
              </div>
              {busy && <p className="mx-muted text-[13px] flex items-center gap-2 px-1"><Loader2 size={14} className="animate-spin" /> Подтверди на устройстве…</p>}
              <p className="mx-muted text-[12px] px-1">Блокировка работает только на этом устройстве и защищает от посторонних рук. Если забудешь код, можно выйти из аккаунта — чаты останутся на сервере.</p>
            </>
          ) : (
            <>
              <div className="mx-card">
                <Line label="Способ" value={modeLabel(cfg)} />
                {hasPin(cfg) && <Btn onClick={() => askVerify("verify-change")}>Сменить код-пароль</Btn>}
                {hasPin(cfg) && bioOk && (
                  <label className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid var(--mx-line)" }}>
                    <span className="flex items-center gap-2"><Fingerprint size={17} /> Face ID / отпечаток</span>
                    <Switch on={hasBio(cfg)} onChange={toggleBio} disabled={busy} />
                  </label>
                )}
                {!hasPin(cfg) && <Btn onClick={addPin}>Добавить код-пароль</Btn>}
              </div>

              <div>
                <p className="mx-muted text-[13px] px-2 pb-1.5">Автоблокировка</p>
                <div className="mx-card">
                  {LOCK_TIMEOUTS.map((t, i) => (
                    <button key={t.v} onClick={() => setTimeoutV(t.v)} className="w-full flex items-center justify-between px-4 py-3 text-left" style={i > 0 ? { borderTop: "1px solid var(--mx-line)" } : undefined}>
                      <span>{t.label}</span>
                      {timeout === t.v && <span style={{ color: "var(--mx-accent)" }}>✓</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mx-card">
                <Btn onClick={() => { close(); lockNow(); }}>Заблокировать сейчас</Btn>
                <Btn danger onClick={() => askVerify("verify-off")}>Выключить блокировку</Btn>
              </div>
            </>
          )}
        </div>
      </Sheet>
      {overlay}
    </>
  );
}

function Option({ icon, title, text, onClick, disabled }: { icon: React.ReactNode; title: string; text: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left disabled:opacity-45" style={{ borderTop: "1px solid var(--mx-line)" }}>
      <span className="w-9 h-9 rounded-xl flex items-center justify-center gap-0.5 shrink-0" style={{ background: "var(--mx-accent)", color: "var(--mx-accent-text, #fff)" }}>{icon}</span>
      <span className="flex-1 min-w-0"><span className="block text-[16px]">{title}</span><span className="block mx-muted text-[13px]">{text}</span></span>
      <ChevronRight size={17} className="mx-muted" />
    </button>
  );
}
function Line({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between px-4 py-3"><span>{label}</span><span className="mx-muted">{value}</span></div>;
}
function Btn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} className="w-full text-left px-4 py-3" style={{ borderTop: "1px solid var(--mx-line)", color: danger ? "var(--mx-danger)" : undefined }}>{children}</button>;
}
