"use client";

import { useState } from "react";
import { ShieldCheck, ShieldOff, Loader2, Copy, Check } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";

type Step = "idle" | "qr" | "backupCodes";

export function TwoFactorCard() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("idle");
  const [busy, setBusy] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [showDisable, setShowDisable] = useState(false);

  async function authFetch(url: string, body: any) {
    const idToken = await user!.getIdToken();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Ошибка");
    return data;
  }

  async function startSetup() {
    setBusy(true);
    try {
      const data = await authFetch("/api/2fa/setup", {});
      setQrDataUrl(data.qrDataUrl);
      setSecret(data.secret);
      setStep("qr");
    } catch (err: any) {
      toast("error", err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await authFetch("/api/2fa/verify-setup", { code: code.trim() });
      setBackupCodes(data.backupCodes);
      setStep("backupCodes");
      setCode("");
      await refreshProfile();
    } catch (err: any) {
      toast("error", err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await authFetch("/api/2fa/disable", { code: disableCode.trim() });
      toast("success", "Двухфакторная аутентификация отключена");
      setShowDisable(false);
      setDisableCode("");
      await refreshProfile();
    } catch (err: any) {
      toast("error", err.message);
    } finally {
      setBusy(false);
    }
  }

  function copyBackupCodes() {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const enabled = !!profile?.twoFactorEnabled;

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {enabled ? <ShieldCheck size={18} className="text-green-400 flex-none" /> : <ShieldOff size={18} className="text-white/30 flex-none" />}
          <div>
            <p className="font-medium">Двухфакторная аутентификация</p>
            <p className="text-sm text-white/40">
              {enabled ? "Включена — при входе будет запрашиваться код из приложения" : "Дополнительная защита входа через приложение-аутентификатор"}
            </p>
          </div>
        </div>
        {step === "idle" && !enabled && (
          <button onClick={startSetup} disabled={busy} className="btn-primary px-4 py-2 text-sm flex-none disabled:opacity-50">
            {busy ? <Loader2 size={15} className="animate-spin" /> : "Включить"}
          </button>
        )}
        {step === "idle" && enabled && !showDisable && (
          <button onClick={() => setShowDisable(true)} className="btn-secondary px-4 py-2 text-sm flex-none">
            Отключить
          </button>
        )}
      </div>

      {step === "qr" && (
        <div className="pt-2 border-t border-border space-y-3">
          <p className="text-sm text-white/60">
            Отсканируй QR-код в Google Authenticator, Authy или любом другом TOTP-приложении, либо введи ключ вручную.
          </p>
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR-код для 2FA" className="rounded-lg bg-white p-2" width={200} height={200} />
          </div>
          <p className="text-xs text-white/40 text-center break-all font-mono">{secret}</p>
          <form onSubmit={confirmSetup} className="flex gap-2">
            <input
              autoFocus
              placeholder="Код из приложения"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="input-field flex-1 text-center tracking-widest font-mono"
              maxLength={6}
            />
            <button type="submit" disabled={busy || code.trim().length !== 6} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
              {busy ? <Loader2 size={15} className="animate-spin" /> : "Подтвердить"}
            </button>
          </form>
        </div>
      )}

      {step === "backupCodes" && (
        <div className="pt-2 border-t border-border space-y-3">
          <p className="text-sm font-medium text-accent">2FA включена! Сохрани резервные коды</p>
          <p className="text-xs text-white/50">
            Если потеряешь доступ к приложению-аутентификатору — сможешь войти по одному из этих кодов (каждый работает один раз). Показываются только сейчас, дальше их не будет видно.
          </p>
          <div className="grid grid-cols-2 gap-1.5 font-mono text-sm bg-black/30 rounded-lg p-3">
            {backupCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <button onClick={copyBackupCodes} className="btn-secondary w-full py-2 text-sm flex items-center justify-center gap-1.5">
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Скопировано" : "Скопировать коды"}
          </button>
          <button onClick={() => setStep("idle")} className="btn-primary w-full py-2 text-sm">
            Готово
          </button>
        </div>
      )}

      {showDisable && (
        <form onSubmit={handleDisable} className="pt-2 border-t border-border space-y-2">
          <p className="text-xs text-white/50">Для отключения введи текущий код из приложения (или резервный код).</p>
          <div className="flex gap-2">
            <input
              autoFocus
              placeholder="Код"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              className="input-field flex-1 text-center tracking-widest font-mono"
            />
            <button type="submit" disabled={busy || !disableCode.trim()} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
              {busy ? <Loader2 size={15} className="animate-spin" /> : "Отключить"}
            </button>
          </div>
          <button type="button" onClick={() => setShowDisable(false)} className="text-xs text-white/40 hover:text-white/70">
            Отмена
          </button>
        </form>
      )}
    </div>
  );
}
