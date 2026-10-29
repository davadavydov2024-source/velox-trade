"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { RefreshCw, Smartphone, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { createDeviceLoginRequest, subscribeDeviceLogin, cleanupDeviceLoginRequest, DEVICE_LOGIN_TTL_MS } from "@/lib/deviceLogin";

type Status = "loading" | "waiting" | "approved" | "denied" | "expired";

export function QrDeviceLogin({ onSuccess }: { onSuccess: () => void }) {
  const { loginWithCustomToken } = useAuth();
  const { toast } = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const unsubRef = useRef<(() => void) | null>(null);

  async function start() {
    setStatus("loading");
    unsubRef.current?.();
    const newCode = await createDeviceLoginRequest();
    setCode(newCode);
    setSecondsLeft(Math.floor(DEVICE_LOGIN_TTL_MS / 1000));

    const url = `${window.location.origin}/auth/link?code=${newCode}`;
    setQrDataUrl(await QRCode.toDataURL(url, { margin: 1, width: 220 }));

    setStatus("waiting");
    unsubRef.current = subscribeDeviceLogin(newCode, async (req) => {
      if (!req) return;
      if (req.status === "approved" && req.token) {
        setStatus("approved");
        try {
          await loginWithCustomToken(req.token);
          await cleanupDeviceLoginRequest(newCode);
          toast("success", "Вход подтверждён с другого устройства");
          onSuccess();
        } catch {
          toast("error", "Не удалось войти. Попробуй ещё раз.");
          setStatus("waiting");
        }
      } else if (req.status === "denied") {
        setStatus("denied");
      }
    });
  }

  useEffect(() => {
    start();
    return () => unsubRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== "waiting") return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setStatus("expired");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [status]);

  return (
    <div className="space-y-4 text-center">
      <p className="text-xs text-white/40">
        Открой камеру на телефоне, где ты уже вошёл в аккаунт, наведи на код — вход подтвердится сам, без пароля.
      </p>

      <div className="relative w-[220px] h-[220px] mx-auto rounded-btn overflow-hidden bg-white flex items-center justify-center">
        {qrDataUrl && status !== "expired" && status !== "denied" ? (
          <img src={qrDataUrl} alt="QR-код для входа" className={`w-full h-full ${status === "approved" ? "opacity-30" : ""}`} />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-black/5">
            {status === "loading" && <RefreshCw size={28} className="animate-spin text-black/30" />}
          </div>
        )}

        {status === "approved" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/70">
            <CheckCircle2 size={32} className="text-green-500" />
            <p className="text-xs text-black/70 font-medium">Входим...</p>
          </div>
        )}
        {(status === "expired" || status === "denied") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            {status === "denied" ? <XCircle size={28} className="text-red-500" /> : <Smartphone size={28} className="text-black/30" />}
            <p className="text-xs text-black/60 font-medium">{status === "denied" ? "Вход отклонён" : "Код истёк"}</p>
            <button onClick={start} className="text-xs font-medium text-accent bg-black/5 px-3 py-1.5 rounded-btn flex items-center gap-1">
              <RefreshCw size={12} /> Обновить код
            </button>
          </div>
        )}
      </div>

      {status === "waiting" && (
        <p className="text-xs text-white/30">
          Ожидаем подтверждения... код истечёт через {Math.floor(secondsLeft / 60)}:{(secondsLeft % 60).toString().padStart(2, "0")}
        </p>
      )}

      {code && status === "waiting" && (
        <details className="text-xs text-white/30">
          <summary className="cursor-pointer select-none">Не получается отсканировать?</summary>
          <p className="mt-2 break-all">
            Открой на телефоне:{" "}
            <span className="text-white/60 font-mono">
              {typeof window !== "undefined" ? `${window.location.origin}/auth/link?code=${code}` : ""}
            </span>
          </p>
        </details>
      )}
    </div>
  );
}
